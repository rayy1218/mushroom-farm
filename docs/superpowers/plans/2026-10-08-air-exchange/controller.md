# Work brief: Air exchange (C9), controller stream

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-10-09. Repo: `/home/foqcus/Documents/mushroom-farm`. Worktree: `~/.config/superpowers/worktrees/mushroom-farm/air-controller` (branch `stream/air-controller`). You work alone in that worktree, made by the lead from the step 0 commit. In this brief, `<base>` means that commit (`git merge-base HEAD master`); `air.js` and `tests/air.test.js` exist there. Contract C9 (`docs/contracts/air.md`) is frozen. Where this brief and C9 disagree, C9 wins: stop and report to the lead. Never put anything durable in `/tmp`.

**Goal:** Replace the one fresh-air fan (levels 0–3, steady mode, AC setback, fog boost) in `controller.js` with the on/off air exchange of C9 section 5: short, capped CO₂ purges, Prepare before each purge, the size alarm, and settings version 2.

**Architecture:** `controller.js` stays one IIFE that sets `global.ClimateController`. The purge cycle is a small state machine in `st.air`. It runs before the AC and the fogger, which read its Prepare offsets, and before the air exchange request, which reads its state. The purge arithmetic (rise rate, size) comes from `air.js` (`global.ClimateAir`), read inside the functions at call time.

**Tech stack:** Plain JavaScript, Node 22, `node:test`, `node:assert/strict`. No build step, no dependencies.

## 1. Goal

| Part | File | Result | C9 |
|---|---|---|---|
| Command | `controller.js` | `air: { on }` replaces `fan: { level }` in `st.cmd`, `st.req` and `cfg.manual`; device key `air` in `st.why`, `st.hold`, `st.out` | 5.1 |
| Settings version 2 | `controller.js` | New keys and ranges, removed keys gone, `RAMP_KEYS`, `SETTINGS_VERSION` 2, `upgradeSettings`, `importSettings` upgrades version 1 files | 5.2 |
| Purge cycle | `controller.js` | `st.air` with the states `idle`, `prepare`, `purge`, `after`; 30 s minimum on; `rules.minOffS`; time cap; capped counter | 5.3 |
| Prepare | `controller.js` | Rise rate from the CO₂ readings with the fans off, `nextPurgeS`, the gap rule, `prepT` / `prepRH` (half the band) used by the AC and the fogger | 5.4 |
| Size message | `controller.js` | `airTooSmall` alarm after 3 capped purges, `st.air.sizeText` with the needed size | 5.5 |
| Rules | `controller.js` | Manual, CO₂ safety, humidity first, purge, timed purge, free cooling, outdoor drying | 5.6 |
| Sensor check | `controller.js` | The CO₂ spike filter skips a falling CO₂ while the fans run and for one reading after | 5.6 |
| Records and display | `controller.js` | `ctl.purges()`, `st.stats`, `status('CO2')`, `st.why.air`, events, old snapshot upgrade | 5.7 |
| Removed | `controller.js` | `acPurge()`, the setback state, `purgeHeld`, `purgeReduced`, `airLevel`, `AIR_STEP_S`, fog boost, `ctl.exhaust()` | 5.7 |
| Vectors | `tests/vectors.test.js`, `tools/make-vectors.js` | Pack `air.on`, `cmdFields`, scenario `crowded-dry`, new scenario `capped-purges` (the lead regenerates) | 9 |

## 2. Owned files (the only files you may change)

| File | At `<base>` | What you do |
|---|---|---|
| `controller.js` | 977 lines | Change (tasks 1–9). About 1096 lines at the end. |
| `tests/controller.test.js` | 38 tests | Delete 13 tests, add 22 (47 at the end) |
| `tests/settings.test.js` | 4 tests | Edit one test, add 5 (9 at the end) |
| `tests/vectors.test.js` | `pack` at line 9 | `pack` and the `air.js` require (task 10) |
| `tools/make-vectors.js` | `packCmd` at line 12, scenarios at lines 39–47 | Pack, `cmdFields`, two scenarios, the `air.js` require (task 10). Do not run it. |

Every other file is read-only for you. That includes `air.js`, `tests/air.test.js`, `tests/vectors/*.json`, `sim.js`, `capacity.js`, `cycle.js`, `calib.js`, `server/**`, `web/**` (also `web/settings-panel.js`), `tests/settings-diff.test.js`, `tests/harness.js`, `tests/integration.test.js`, `index.html`, `package.json` and `docs/**`. If you need a change there, stop and report to the lead.

## 3. Read first

| Document | Sections | Why |
|---|---|---|
| `docs/contracts/air.md` (C9) | 1, 2, 3, 5, 9, 10, 11 | **Your contract.** Words, ownership, `ClimateAir`, the controller rules, vectors, tests |
| `docs/superpowers/specs/2026-10-08-air-exchange-purge-design.md` | Purpose, Physics, 2, 4.1, 5 | Why purges are short, which way Prepare moves, the sizing rule |
| `docs/superpowers/plans/2026-10-08-air-exchange/README.md` | Task 0.2, "Step 1: streams", Task 2.3 | The `air.js` code; what the lead reads from your controller (`state.stats`, `state.air.sizeText`, `alarmList()`) |
| `air.js` | All (55 lines) | `riseRate`, `prodFromRise`, `sizeFor`, `MIN_POINTS` |
| `controller.js` | All (977 lines) | The code you change. Read it fully once. |
| `tests/controller.test.js` | 1–20 | The `make()` and `feed()` helpers every new test uses |

## 4. Contracts you build against

### 4.1 What you export (C9 section 5)

| Export | Shape after this stream | C9 |
|---|---|---|
| `ctl.update(reading)` | Returns `{ ac: { power, mode, setpoint, fan }, hu: { level }, air: { on }, lights: { on }, circ: { on } }` | 5.1 |
| `cfg.manual.air` | `{ auto: true, on: false }` (replaces `manual.fan`) | 5.1 |
| `ctl.state.air` | `{ state, since, purgeStart, capRun, prepT, prepRH, nextPurgeS, delayed, timed, sizeText }` | 5.3 |
| `ctl.state.stats` | `{ airOnS, purges, purgeS, longestPurgeS, cappedPurges, delayedS, fogStarts, acCmds }`. `purges`, `purgeS`, `longestPurgeS`, `cappedPurges` count CO₂ purges only (state `purge`, counted in `startPurge` / `endPurge`); `airOnS` counts every air run. | 5.7 |
| `ctl.state.why.air`, `ctl.state.hold.air`, `ctl.state.out.air.since` | Strings; time of the last switch | 5.1, 5.7 |
| `ctl.state.airReason` | Reason of the running air run, `null` when off | 5.3 |
| `ctl.purges()` | `{ cur, events, hours }`; `cur` is the running air run in the event shape with `end: null`, `co2End: null`, `capped: false`, and `null` when the fans are off; event `{ start, end, reason, co2Start, co2End, m3, capped }`; hour `{ h, runS, starts, m3, cappedN, fogLS, acHighS, acLowS }` | 5.7 |
| `ctl.status('CO2')` | Sensor fault, `co2Safe`, `co2Hi`, safety run (`airReason === 'safety'` → `{ lvl: 'serious', icon: '◆', text: 'Safety run' }`), delayed, purge, prepare, below limit | 5.7 |
| `ctl.exhaust()` | Removed | 5.7 |
| `ClimateController.upgradeSettings(obj)` | `{ settings, warnings }`, pure | 5.2 |
| `ClimateController.SETTINGS_VERSION` | `2` | 5.2 |
| `defaultSettings()` | Adds `airM3h: 1800`; `rules` adds `purgeMaxS`, `prepare`, `prepareLeadS`, `minOffS`; the 15 removed keys are gone | 5.2 |
| `MACHINES` | `airTags: ['SF-203', 'EF-206']`; no `fanLevels`, no `fanM3h` | 5.1 |
| `ALARMS` | Adds `{ id: 'airTooSmall', label: 'Air exchange too small for the CO₂ load', lvl: () => 'warning' }` | 5.5 |

### 4.2 What you use (`air.js`, at `<base>`)

| Export | Called from | For |
|---|---|---|
| `ClimateAir.riseRate(points)` | `airPlan` (every update) | Rise rate in ppm/s; `null` with fewer than 4 points |
| `ClimateAir.prodFromRise(o)` | `sizeCheck` | CO₂ output (m³/h) from the last rise rate |
| `ClimateAir.sizeFor(o)` | `sizeCheck` | `needM3h` for the size text |

Read it as `const AIR = global.ClimateAir` **inside** the function (C9 3). Every test file of this stream requires `../air.js` before `../controller.js`.

### 4.3 Names and texts (C9 5 fixes the ones marked C9; the rest are this brief's)

| Name | Meaning |
|---|---|
| `st.airReason` (C9 5.3) | Reason of the running air run: `'purge'`, `'safety'`, `'timed'`, `'free cooling'`, `'drying'` or `'manual'`; `null` when off. `update` sets it after `protectAir` from the reason `airExchange` returns; while the minimum run time holds the fans on with no request, it keeps the last reason. The record's event `reason` is its value when the run starts. |
| `st.airPts` | Rise points `{ t, C }`: the good CO₂ readings since the last air run ended, at most 20 |
| `st.airRate` (C9 5.5) | The last rise rate that was not `null` (ppm/s), for the size estimate |
| `st.purgeRec` | The purge record that `ctl.purges()` returns (replaces `st.exh`) |
| `st.airPrepared` | `true` when the running purge started from `prepare`: the Prepare offsets stay on in that purge only (C9 5.4 gap rule) |
| `st.airRunCapped` | `true` when a capped purge ended during the running air run. It goes into the event's `capped` when the run ends, so `cur.capped` stays `false` (C9 5.7). |
| `co2FallFree` | Argument of `validate`: the fans were on in the last interval, or stopped at the last reading (C9 5.6 sensor check). Applies to `CO2` and `CO2b`. |
| `st.rhLocked`, `st.co2SafetyOn`, `st.fanDryOn` | Kept: the humidity-first lock, the safety run (now with the 20 ppm hysteresis), the drying hysteresis. During a safety run `st.air.state` is `idle` (a safety run is not a purge, C9 5.3); when it ends with CO₂ still at or above `fanOn`, a normal purge starts at once (the fans are still on, so no minimum off time). |
| `AIR_MIN_ON_S`, `AIR_POINTS`, `CO2_OUT` | `30` s, `20` readings, `420` ppm |
| `mss(s)` | `m:ss`, for example `mss(180)` = `3:00` |

| Case | Text |
|---|---|
| `why.air` in a safety run | `CO₂ is <x> ppm, at or above the safety level <co2SafetyAt>. The air exchange runs even when humidity is low.` |
| `why.air` in a timed purge, on / off | `CO₂ sensor fault: timed purge, <run> s of each <period> s (from this hour of an earlier day \| the setting).` / `CO₂ sensor fault: timed purge. The air exchange is in the off part of the cycle.` |
| `why.air` while delayed | `Humidity first: RH <x> % is at or below <rhT − rhStop> % and outdoor air is drier. The purge waits until RH is <rhT − rhResume> % or CO₂ is <co2Lim> ppm.` |
| `why.air` in free cooling / drying / manual | `Outdoor air is <d> °C cooler. The air exchange runs to help the AC.` / `Humidity is high and outdoor air is drier. The air exchange runs to dry the room.` / `Manual control. The controller does not change this output.` |
| `hold.air` | `Minimum run time: <n> s to wait.` / `Minimum off time: <n> s to wait.` |
| `why.ac`, `why.hu` in prepare and purge | Adds ` Prepare for a purge: the AC aims at <spT+prepT> °C.` / ` Prepare for a purge: the fogger aims at <rhT+prepRH> %.` |
| Events not listed in C9 | `CO₂ safety level: the air exchange runs, ignoring the time cap` / `CO₂ below the safety level`; `CO₂ sensor back: timed purge ended` (today's text); `Air exchange: <reason>` when the reason changes during a run |
| `sizeText` without a rise rate (C9 5.5) | `Purges don't reach <fanOff> ppm in <cap> min. The air exchange is too small; the size needed is not measured yet.` |
| `sizeText` with `needM3h = Infinity` (C9 5.5) | `Purges don't reach <fanOff> ppm in <cap> min: outside air alone cannot bring CO₂ this low; raise the stop level.` |

### 4.4 One update, in order (after this stream)

| Step | Function | What it does |
|---|---|---|
| 1 | `update` (top) | Record the time since the last reading with the old commands: `addRun` (air on), `addFog`, `addAcFan`; `stats.airOnS`, `stats.delayedS` |
| 2 | `program`, `validate(r, co2FallFree)`, humidity target | As today, except that the CO₂ rate test skips a falling CO₂ while `co2FallFree` (C9 5.6 sensor check) |
| 3 | `alarms` | As today. Skips `ALARMS` entries without `on` (`airTooSmall`). |
| 4 | `airPlan` | Rise points and rate; P1 safety; manual or CO₂ fault reset; `nextPurgeS`; P2 `humidityFirst`; the states; Prepare offsets |
| 5 | `airConditioner` | Uses `spT + st.air.prepT` |
| 6 | `fogger` | Uses `st.rhT + st.air.prepRH` |
| 7 | `airExchange` | `req.air.on`, `why.air` (manual, safety, purge, timed purge, free cooling, drying); returns the reason |
| 8 | `lights`, `circulation` | As today |
| 9 | `protectAir`, then `st.airReason`; `protectOnOff('hu', …)`, `protectAc` | 30 s minimum on and `minOffS` for the air exchange; the reason of the running run; the fogger and AC as today |
| 10 | `responseCheck` | CO₂ window starts when the air exchange goes from off to on |
| 11 | `recordPurges` | Start and end of each air run |
| 12 | `log` | Events |

### 4.5 Tests outside this stream that fail until the lead merges

Measured on a prototype of this brief: `npm test` fails 92 tests, all in these 9 files. Every other test file passes.

| Test file | Failing tests (prototype) | Why | Fixed by |
|---|---|---|---|
| `tests/vectors.test.js` | 8 | The recorded files pack `fanLevel` and their settings have no `manual.air` (`TypeError: … reading 'auto'`) | Lead, step 2 (`npm run vectors`, C9 9) |
| `tests/integration.test.js` | 15 | `tests/harness.js` does not require `air.js`; `sim.js` reads `cmd.fan.level`; the harness reads `fanOnS`, `fanStarts` | Simulation stream and lead (task 2.3) |
| `tests/capacity.test.js` | 13 | No `air.js` require; `capacity.js` reads `rules.baseFan`; `sim.js` reads `cmd.fan` | Simulation stream |
| `tests/cycle.test.js` | 16 | `cycle.js` sets `cfg.manual.fan.auto`; `sim.js` | Simulation stream |
| `tests/calib.test.js` | 2 | No `air.js` require; the test reads `cmd.fan.level`; `sim.js` | Simulation stream |
| `tests/rooms.test.js` | 34 | `server/rooms.js` does not require `air.js` and reads `cmd.fan.level` in the reading row | Data stream |
| `tests/db.test.js` | 2 | Runs a real controller without `air.js`; `sim.js` | Data stream |
| `tests/web-bench.test.js` | 1 | Runs a controller without `air.js`; `sim.js` | Web stream |
| `tests/settings-diff.test.js` | 1 | `web/settings-panel.js` `FIELDS` lists removed keys (`rules.rhAction`, …) | Web stream |

## Task 0: Start

**Files:** none.

- [ ] **Step 1: Check the worktree.**

```bash
cd ~/.config/superpowers/worktrees/mushroom-farm/air-controller
git status --short          # expected: nothing
git branch --show-current   # expected: stream/air-controller
ls air.js tests/air.test.js # expected: both exist
```

- [ ] **Step 2: Run the whole suite once.** `npm test` → expected `# fail 0`. If anything fails at `<base>`, stop and report to the lead.
- [ ] **Step 3: Note the counts.** `node --test tests/controller.test.js` → `# pass 38`; `node --test tests/settings.test.js` → `# pass 4`.

## Task 1: `upgradeSettings` (C9 5.2)

**Files:** Modify `controller.js` (insert before `exportSettings`, line 927; exports line 976). Test: `tests/settings.test.js`.

`upgradeSettings` is pure and stands alone, so it comes first. `importSettings` does not call it yet (task 2).

- [ ] **Step 1: Write the failing test.** Apply these edits in order.

- [ ] **1.1** `tests/settings.test.js`, line 4. Replace:

```js
require('../controller.js');
```

with:

```js
require('../air.js');
require('../controller.js');
```

- [ ] **1.2** `tests/settings.test.js`: append at the end of the file (after line 41), after one blank line:

```js
// ---------- Version 2 (contract C9 section 5.2) ----------
// The settings of a version 1 controller (one fresh-air fan), with every key that version 2 removes.
function v1Settings() {
  const s = CC.defaultSettings();
  delete s.airM3h;
  for (const k of ['purgeMaxS', 'prepare', 'prepareLeadS', 'minOffS']) delete s.rules[k];
  Object.assign(s.rules, { fanOn: 1200, fanOff: 950, rhAction: 'low', airMode: 'steady', baseFan: { spawn: 0, pinning: 1, fruiting: 1, rest: 0 },
    fanLevel: 2, fogBoost: true, acPurge: true, acAction: 'setback', acSetbackC: 1, acOff: 900, acOn: 700, maxSetback: 30, guard: true });
  Object.assign(s.protect, { fanMinOn: 2, fanMinOff: 2 });
  delete s.manual.air;
  s.manual.fan = { auto: false, level: 2 };
  return s;
}
const REMOVED = ['rules.airMode', 'rules.baseFan', 'rules.fanLevel', 'rules.fogBoost', 'rules.rhAction', 'rules.acPurge', 'rules.acAction',
  'rules.acSetbackC', 'rules.acOff', 'rules.acOn', 'rules.maxSetback', 'rules.guard', 'protect.fanMinOn', 'protect.fanMinOff', 'manual.fan'];
const gone = k => `Setting "${k}" was removed: fresh air now runs as short purges.`;

test('upgradeSettings: one warning per removed key, manual.fan becomes manual.air; pure and idempotent', () => {
  const old = v1Settings(), copy = structuredClone(old);
  const a = CC.upgradeSettings(old);
  assert.deepEqual(old, copy, 'the input is not changed');
  assert.deepEqual(a.warnings, REMOVED.map(gone));
  for (const k of REMOVED) { const [g, key] = k.split('.'); assert.equal(key in a.settings[g], false, k); }
  assert.deepEqual(a.settings.manual.air, { auto: false, on: true });
  assert.deepEqual([a.settings.rules.fanOn, a.settings.rules.fanOff], [1200, 950]);
  assert.equal(a.settings.airM3h, undefined, 'missing keys are not added here');
  assert.deepEqual(CC.upgradeSettings(a.settings), { settings: a.settings, warnings: [] }, 'idempotent');
  assert.deepEqual(CC.upgradeSettings({ manual: { fan: { auto: true } } }).settings.manual.air, { auto: true, on: false });
  assert.deepEqual(CC.upgradeSettings({ manual: { fan: 3 } }), { settings: { manual: {} }, warnings: [gone('manual.fan')] });
  assert.deepEqual(CC.upgradeSettings(null), { settings: null, warnings: [] });
});
```

- [ ] **Step 2: Run it to see it fail.** `node --test tests/settings.test.js` → expected `# pass 4`, `# fail 1`:

| Test | Expected error |
|---|---|
| `upgradeSettings: one warning per removed key, …` | `CC.upgradeSettings is not a function` |

- [ ] **Step 3: Implement.** Apply these edits in order.

- [ ] **3.1** `controller.js`, line 927. Replace:

```js
  function exportSettings(cfg) {
```

with:

```js
  // Settings of the one fresh-air fan, removed by contract C9. An older file can still have them.
  const REMOVED_SETTINGS = ['rules.airMode', 'rules.baseFan', 'rules.fanLevel', 'rules.fogBoost', 'rules.rhAction', 'rules.acPurge',
    'rules.acAction', 'rules.acSetbackC', 'rules.acOff', 'rules.acOn', 'rules.maxSetback', 'rules.guard', 'protect.fanMinOn', 'protect.fanMinOff'];
  // Bring a settings object of version 1 to version 2 (C9 5.2). Pure: obj is not changed. Keys missing from the
  // new shape are not added here (importSettings fills the defaults). A version 2 object gives no warnings.
  function upgradeSettings(obj) {
    const warnings = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { settings: obj, warnings };
    const settings = structuredClone(obj);
    const gone = path => warnings.push(`Setting "${path}" was removed: fresh air now runs as short purges.`);
    for (const path of REMOVED_SETTINGS) {
      const [group, key] = path.split('.'), g = settings[group];
      if (g && typeof g === 'object' && Object.hasOwn(g, key)) { delete g[key]; gone(path); }
    }
    const m = settings.manual;
    if (m && typeof m === 'object' && Object.hasOwn(m, 'fan')) {
      const fan = m.fan;
      if (fan && typeof fan === 'object') m.air = { auto: !!fan.auto, on: (fan.level ?? 0) > 0 };
      delete m.fan;
      gone('manual.fan');
    }
    return { settings, warnings };
  }
  function exportSettings(cfg) {
```

- [ ] **3.2** `controller.js`, line 999. Replace:

```js
global.ClimateController = { exportSettings, importSettings, applySettings,
```

with:

```js
global.ClimateController = { exportSettings, importSettings, upgradeSettings, applySettings,
```

- [ ] **Step 4: Run the tests.** `node --test tests/settings.test.js tests/controller.test.js` → expected `# pass 43`, `# fail 0` (settings 5, controller 38).
- [ ] **Step 5: Commit.**

```bash
git add controller.js tests/settings.test.js
git commit -m "feat(controller): upgradeSettings for version 1 settings (C9 5.2)"
```

## Task 2: The air exchange command, settings version 2 and the purge cycle (C9 5.1–5.3, 5.6, 5.7)

**Files:** Modify `controller.js` (most of the file). Test: `tests/controller.test.js`, `tests/settings.test.js`.

This is the large step: every use of the old fan goes in one commit, because the old settings keys and the old logic depend on each other. After it, the cycle has the states `idle`, `purge` and `after`. Prepare (task 3), humidity first (task 4), the timed purge (task 5), the size alarm (task 6) and the snapshot upgrade (task 7) follow.

| What changes | Where (at `<base>`) |
|---|---|
| `RAMP_KEYS`, `MACHINES`, `AIR_MIN_ON_S` | Lines 79, 89–90, 118 |
| `defaultRules`, `defaultProtect`, `profileTargets`, `defaultSettings` | Lines 122–185 |
| `mss`, `airInit`, `freshState`; `create` starts from `freshState` | Lines 208–229 |
| `co2Purge`, `priorities`, `acPurge` → `setState`, `startPurge`, `endPurge`, `airPlan` | Lines 443–498 |
| AC: no setback | Lines 533, 544–561 |
| Fogger: no fog boost | Lines 629–634 |
| `exhaustFan` → `airExchange`, `airWhy` | Lines 643–681 |
| `responseCheck`, `protectOnOff` (fogger only), `protectAir` | Lines 709–745 |
| Record: `hourBucket`, `addRun`, `historyFor`, `recordPurges` (`cur` keeps `capped: false` while running); `log`; `update` | Lines 758–877 |
| `status('CO2')`, `purges()` | Lines 899–903 |
| `SETTINGS_VERSION`, `SETTING_LIMITS`, `SETTING_ENUMS`, `importSettings` | Lines 907–965 |

- [ ] **Step 1: Write the failing tests.** Apply these edits in order. The line numbers are those of the file at that moment, with the earlier edits of this step done.

- [ ] **1.1** `tests/settings.test.js`, line 19. Replace:

```js
  f.settings.rules.fanLevel = 'High';                  // wrong type
```

with:

```js
  f.settings.rules.purgeMaxS = 'long';                 // wrong type
```

- [ ] **1.2** `tests/settings.test.js`, line 25. Replace:

```js
  assert.equal(settings.rules.fanLevel, 2);
```

with:

```js
  assert.equal(settings.rules.purgeMaxS, 180);
```

- [ ] **1.3** `tests/settings.test.js`: append at the end of the file (after line 73), after one blank line:

```js
test('a version 1 file: one warning per removed key first, manual.fan becomes manual.air, fanOn and fanOff kept', () => {
  const { settings, warnings } = CC.importSettings({ format: 'mushroom-climate-settings', version: 1, settings: { ...v1Settings(), hacked: true } });
  assert.deepEqual(warnings, [...REMOVED.map(gone), 'Unknown setting "hacked" is ignored.']);
  assert.deepEqual(settings.manual.air, { auto: false, on: true });
  assert.equal('fan' in settings.manual, false);
  assert.deepEqual([settings.rules.fanOn, settings.rules.fanOff], [1200, 950]);
  for (const k of REMOVED) { const [g, key] = k.split('.'); assert.equal(key in settings[g], false, k); }
  assert.deepEqual([settings.airM3h, settings.rules.purgeMaxS, settings.rules.prepare, settings.rules.prepareLeadS, settings.rules.minOffS], [1800, 180, true, 180, 60]);
  const noVersion = CC.importSettings({ format: 'mushroom-climate-settings', settings: v1Settings() });
  assert.deepEqual(noVersion.warnings, REMOVED.map(gone), 'a file without a version is version 1');
});

test('a version 2 file round-trips the new keys with no warnings; a removed key in it is unknown', () => {
  const cfg = CC.defaultSettings();
  Object.assign(cfg.rules, { purgeMaxS: 240, prepare: false, prepareLeadS: 120, minOffS: 90 });
  cfg.airM3h = 2400; cfg.manual.air = { auto: false, on: true };
  const r = CC.importSettings(CC.exportSettings(cfg));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.settings, cfg);
  const f = CC.exportSettings(CC.defaultSettings()); f.settings.rules.airMode = 'steady';
  assert.deepEqual(CC.importSettings(f).warnings, ['Unknown setting "rules.airMode" is ignored.']);
});

test('the new settings are held inside their ranges', () => {
  const f = CC.exportSettings(CC.defaultSettings());
  f.settings.airM3h = 20;
  Object.assign(f.settings.rules, { purgeMaxS: 5000, prepareLeadS: -5, minOffS: 10 });
  const { settings, warnings } = CC.importSettings(f);
  assert.deepEqual([settings.airM3h, settings.rules.purgeMaxS, settings.rules.prepareLeadS, settings.rules.minOffS], [50, 900, 0, 30]);
  assert.deepEqual(warnings, [
    '"airM3h" = 20 is outside 50–10000: set to 50.',
    '"rules.purgeMaxS" = 5000 is outside 60–900: set to 900.',
    '"rules.prepareLeadS" = -5 is outside 0–900: set to 0.',
    '"rules.minOffS" = 10 is outside 30–600: set to 30.',
  ]);
});

test('version 2: the version, the ramp keys, the defaults and the machines', () => {
  assert.equal(CC.SETTINGS_VERSION, 2);
  assert.deepEqual(Object.keys(CC.profileTargets('oyster', 'fruiting')), ['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff']);
  const d = CC.defaultSettings();
  assert.deepEqual(CC.upgradeSettings(d), { settings: d, warnings: [] }, 'the defaults have no removed key');
  assert.deepEqual([d.airM3h, d.rules.purgeMaxS, d.rules.prepare, d.rules.prepareLeadS, d.rules.minOffS], [1800, 180, true, 180, 60]);
  assert.deepEqual(d.manual.air, { auto: true, on: false });
  assert.deepEqual(CC.MACHINES.airTags, ['SF-203', 'EF-206']);
  assert.equal('fanLevels' in CC.MACHINES, false);
  assert.equal('fanM3h' in CC.MACHINES, false);
});
```

- [ ] **1.4** `tests/controller.test.js`, line 4. Replace:

```js
require('../controller.js');
```

with:

```js
require('../air.js');
require('../controller.js');
```

- [ ] **1.5** `tests/controller.test.js`, line 9. Replace:

```js
// fan 700-900 ppm, safety level 1500, min on/off 2 min, AC command every 2 min.
```

with:

```js
// purge 900 -> 700 ppm, at most 180 s, 60 s off, air exchange 1800 m³/h, safety level 1500, AC command every 2 min.
```

- [ ] **1.6** In `tests/controller.test.js`, delete these 13 tests, each from its `test(` line to its closing `});` and the blank line after it. The line numbers are those before the first deletion.

| Test title | Lines |
|---|---|
| purge mode: the fan starts at the start level and stops at the stop level | 23–29 |
| purge mode: the fan keeps its minimum run time and minimum off time | 31–39 |
| humidity first (action "stop"): after 5 min of full fog the fan stops at once; the purge continues after recovery | 41–49 |
| humidity first gives the fogger 5 min at full before the air is reduced | 51–59 |
| steady fresh air: base level Low, one step each 5 min with CO2, never below the base in fruiting | 61–71 |
| humidity first can reduce the fan to Low instead of a stop | 89–93 |
| the CO2 safety level runs the fan even when humidity is low, with a critical alarm | 95–102 |
| during a purge the AC setpoint goes up (setback); the AC is not turned off | 104–115 |
| the old rule "AC off during purge" is still available for comparison | 117–122 |
| the setback ends at the longest setback time | 124–132 |
| purge mode: the fogger never stops for a purge, and fogs one level more | 134–141 |
| a missing CO2 sensor gives a fault after 3 readings and starts the timed purge | 143–155 |
| the exhaust record counts each exhaust and splits the air volume at the full hour | 211–224 |

- [ ] **1.7** `tests/controller.test.js`: append at the end of the file (after line 278), after one blank line:

```js
// ---------- Air exchange (contract C9 section 5) ----------
test('purge cycle: idle, purge at the start level, after at the stop level, idle after the minimum off time', () => {
  const { feed, ctl, events } = make({ rules: { prepare: false } });
  assert.equal(feed(0, { CO2: 850 }).air.on, false);
  assert.equal(ctl.state.air.state, 'idle');
  assert.equal(ctl.state.why.air, 'CO₂ is 850 ppm. The next purge starts at 900 ppm.');
  assert.equal(feed(30, { CO2: 900 }).air.on, true);
  assert.equal(ctl.state.air.state, 'purge');
  assert.equal(ctl.state.air.purgeStart, 30);
  assert.equal(feed(60, { CO2: 750 }).air.on, true, 'above the stop level: still on');
  assert.equal(feed(90, { CO2: 700 }).air.on, false, 'stop level after 60 s');
  assert.equal(ctl.state.air.state, 'after');
  assert.deepEqual([ctl.state.stats.purges, ctl.state.stats.purgeS, ctl.state.stats.cappedPurges, ctl.state.air.capRun], [1, 60, 0, 0]);
  feed(120, { CO2: 720 });
  assert.equal(ctl.state.air.state, 'after', '30 s off');
  assert.equal(ctl.state.why.air, 'Minimum off time: 30 s.');
  feed(150, { CO2: 740 });
  assert.equal(ctl.state.air.state, 'idle', '60 s off');
  assert.ok(events.some(e => e.text === 'Air exchange on: purge'));
  assert.ok(events.some(e => e.text === 'Air exchange off (1:00, CO₂ 700 ppm)'));
});

test('every air run lasts at least 30 s, then stays off for the minimum off time', () => {
  const { feed, ctl } = make({ rules: { prepare: false } });
  assert.equal(feed(0, { T: 25.4, tOut: 20 }).air.on, true, 'free cooling');
  assert.equal(ctl.state.airReason, 'free cooling');
  assert.equal(feed(10, { T: 25.1, tOut: 20 }).air.on, true, 'no longer warm, but the minimum run time');
  assert.equal(ctl.state.hold.air, 'Minimum run time: 20 s to wait.');
  assert.equal(ctl.state.airReason, 'free cooling', 'the run keeps its reason');
  assert.equal(feed(30, { T: 25.1, tOut: 20.1 }).air.on, false);
  assert.equal(ctl.state.airReason, null, 'off: no reason');
  assert.equal(feed(60, { T: 25.4, tOut: 20 }).air.on, false, 'warm again, but the minimum off time (60 s)');
  assert.equal(ctl.state.hold.air, 'Minimum off time: 30 s to wait.');
  assert.equal(feed(90, { T: 25.45, tOut: 20 }).air.on, true);
});

test('a purge ends at the stop level only after 30 s', () => {
  const { feed, ctl } = make({ rules: { prepare: false } });
  feed(0, { CO2: 950 });
  assert.equal(feed(15, { CO2: 690 }).air.on, true, '15 s: still purging');
  assert.equal(ctl.state.air.state, 'purge');
  assert.equal(feed(30, { CO2: 680 }).air.on, false);
});

test('a purge stops at the time cap and counts as capped; the next purge waits for the minimum off time', () => {
  const { feed, ctl, events } = make({ rules: { prepare: false } });
  for (let t = 0; t <= 150; t += 30) assert.equal(feed(t, { CO2: 950 + (t % 60 ? 1 : 0) }).air.on, true, `t=${t}`);
  assert.deepEqual(ctl.purges().cur, { start: 0, end: null, reason: 'purge', co2Start: 950, co2End: null, m3: 75, capped: false }, 'the running purge');
  assert.equal(feed(180, { CO2: 951 }).air.on, false, '180 s: the cap');
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, ctl.state.stats.cappedPurges], ['after', 1, 1]);
  assert.ok(events.some(e => e.text === 'Purge stopped at the time cap (3:00)'));
  assert.equal(ctl.purges().events[0].capped, true);
  assert.equal(ctl.purges().hours[0].cappedN, 1);
  assert.equal(feed(210, { CO2: 950 }).air.on, false, 'minimum off time');
  assert.equal(feed(240, { CO2: 951 }).air.on, true, 'then the next purge');
  assert.equal(ctl.state.stats.purges, 2);
});

test('a CO2 safety run is not a purge: no cap, no count; below the level the normal purge takes over', () => {
  const { feed, ctl } = make();
  assert.equal(feed(0, { CO2: 1550 }).air.on, true);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'serious', icon: '◆', text: 'Safety run' }, 'before the critical alarm (60 s delay)');
  for (let t = 30; t <= 600; t += 30) assert.equal(feed(t, { CO2: 1550 + (t % 60 ? 1 : 0) }).air.on, true, `t=${t}`);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'critical', icon: '◆', text: 'Safety level' }, 'the alarm comes first');
  assert.equal(ctl.state.airReason, 'safety');
  assert.equal(ctl.state.alarms.co2Safe.active, true);
  assert.equal(ctl.state.alarms.co2Safe.lvl, 'critical');
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, ctl.state.stats.purges, ctl.state.stats.cappedPurges], ['idle', 0, 0, 0], '10 min, no cap');
  assert.equal(feed(630, { CO2: 1485 }).air.on, true, 'above 1480 ppm: still the safety run');
  assert.equal(ctl.state.airReason, 'safety');
  assert.equal(feed(660, { CO2: 1470 }).air.on, true, 'below 1480 ppm: a normal purge goes on');
  assert.deepEqual([ctl.state.air.state, ctl.state.air.purgeStart, ctl.state.airReason, ctl.state.stats.purges], ['purge', 660, 'purge', 1]);
  assert.deepEqual([ctl.purges().events.length, ctl.purges().cur.reason], [0, 'safety'], 'one air run; it started as a safety run');
  const b = make({ rules: { prepare: false } });
  b.feed(0, { CO2: 950 }); b.feed(30, { CO2: 1400 }); b.feed(60, { CO2: 1550 });
  const S = b.ctl.state.stats;
  assert.deepEqual([b.ctl.state.air.state, S.purges, S.purgeS, S.cappedPurges, b.ctl.state.airReason], ['idle', 1, 60, 0, 'safety'], 'a running purge ends, not capped');
});

test('the purge record: each air run with reason, CO2, air volume and capped flag, split at the full hour', () => {
  const { feed, ctl } = make({ rules: { prepare: false, purgeMaxS: 900 } });
  feed(3300, { CO2: 950 });                                    // on at 55 min
  feed(3600, { CO2: 950 });
  feed(3900, { CO2: 690 });                                    // off at 1 h 5 min
  const X = ctl.purges();
  assert.equal(X.cur, null);
  assert.deepEqual(X.events, [{ start: 3300, end: 3900, reason: 'purge', co2Start: 950, co2End: 690, m3: 300, capped: false }]);   // 10 min at 1800 m³/h
  const h0 = X.hours.find(b => b.h === 0), h1 = X.hours.find(b => b.h === 1);
  assert.deepEqual([h0.runS, h0.m3, h0.starts, h0.cappedN], [300, 150, 1, 0]);
  assert.deepEqual([h1.runS, h1.m3, h1.starts, h1.cappedN], [300, 150, 0, 0]);
  const S = ctl.state.stats;
  assert.deepEqual([S.airOnS, S.purges, S.purgeS, S.longestPurgeS, S.cappedPurges], [600, 1, 600, 600, 0]);
});

test('status CO2 and the why text while purging; manual control acts at once', () => {
  const { feed, ctl, cfg } = make({ rules: { prepare: false } });
  feed(0, { CO2: 950 });
  assert.deepEqual(ctl.status('CO2'), { lvl: 'info', icon: '▲', text: 'Purging' });
  assert.equal(ctl.state.why.air, 'Purging since 0:00 (at most 3:00). It stops at 700 ppm.');
  feed(60, { CO2: 940 });
  assert.equal(ctl.state.why.air, 'Purging since 1:00 (at most 3:00). It stops at 700 ppm.');
  cfg.manual.air = { auto: false, on: false };
  assert.equal(feed(70, { CO2: 930 }).air.on, false, 'a manual Off acts at once');
  assert.equal(ctl.state.air.state, 'idle');
  assert.equal(ctl.state.airReason, null, 'off: no reason');
  assert.deepEqual(ctl.status('CO2'), { lvl: 'good', icon: '✓', text: 'Below limit' });
  cfg.manual.air.on = true;
  assert.equal(feed(80, { CO2: 920 }).air.on, true, 'a manual On acts at once');
  assert.equal(ctl.state.airReason, 'manual');
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 29`, `# fail 12`:

| Tests | Expected error |
|---|---|
| The 5 new controller tests that read `.air.on` | `Cannot read properties of undefined (reading 'on')` |
| `the purge record: …` | `ctl.purges is not a function` |
| `status CO2 and the why text while purging; …` | An `AssertionError` (`Purge on` is not `Purging`) |
| `bad values are corrected, …` and the 4 new settings tests | `AssertionError` (old version, old defaults) |

- [ ] **Step 3: Implement.** Apply these edits in order. The line numbers are those of the file at that moment, with the earlier edits of this step done.

- [ ] **3.1** `controller.js`, line 79. Replace:

```js
const RAMP_KEYS = ['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff', 'rules.acOff', 'rules.acOn'];
```

with:

```js
const RAMP_KEYS = ['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff'];
```

- [ ] **3.2** `controller.js`, lines 89–90. Replace:

```js
    fanLevels: ['Off', 'Low', 'Medium', 'High'],
    fanM3h: [0, 300, 600, 900],          // airflow per fan level (data sheet)
```

with:

```js
    airTags: ['SF-203', 'EF-206'],       // the air exchange: filtered intake fan and exhaust fan, on and off together
```

- [ ] **3.3** `controller.js`, line 117. Replace:

```js
  const AIR_STEP_S = 300;          // steady fresh air: at most one fan step each 5 min
```

with:

```js
  const AIR_MIN_ON_S = 30;         // every air run lasts at least this long, so a noisy reading cannot stop it at once
```

- [ ] **3.4** `controller.js`, lines 121–144: replace everything from the line that starts with `function defaultRules(lim) {` up to, not including, the line that starts with `function defaultProgram() {`, with:

```js
  function defaultRules(lim) {
    return {
      // P1 CO2 safety level
      co2Safety: true, co2SafetyAt: lim + 500,
      // P2 humidity first: a purge that would dry the room waits while RH is low
      rhLock: true, rhStop: 3, rhResume: 1,
      // P3 CO2 purge: start and stop levels (ppm), time cap (s), Prepare and its lead time (s), minimum off time (s)
      fanOn: lim - 100, fanOff: Math.max(450, lim - 300), purgeMaxS: 180, prepare: true, prepareLeadS: 180, minOffS: 60,
      // P4 the air exchange also runs for free cooling and outdoor drying
      freeCool: true, outdoorDry: true,
      // 2.6: fog cools first when the room is warm; AC fan speed follows humidity (high fan = warmer coil = less water out)
      fogCool: true, acFanRH: true,
    };
  }
  function defaultProtect() {
    return {
      fogMinOn: 1, fogMinOff: 1, acMinCmd: 2,                                  // minutes
      timedPurgeOn: 10, timedPurgeEvery: 30, faultFogLevel: 1,                 // safe states (fallback)
      learnSafe: true,                       // safe states copy the average of the hours before the fault
    };
  }
```

- [ ] **3.5** `controller.js`, line 159. Replace:

```js
    return { spT: t, spRH: h, co2Lim: c, 'rules.co2SafetyAt': d.co2SafetyAt, 'rules.fanOn': d.fanOn, 'rules.fanOff': d.fanOff, 'rules.acOff': d.acOff, 'rules.acOn': d.acOn };
```

with:

```js
    return { spT: t, spRH: h, co2Lim: c, 'rules.co2SafetyAt': d.co2SafetyAt, 'rules.fanOn': d.fanOn, 'rules.fanOff': d.fanOff };
```

- [ ] **3.6** `controller.js`, line 170. Replace:

```js
      roomM3: 60,                            // room volume, for air changes per hour
```

with:

```js
      roomM3: 60,                            // room volume, for air changes per hour and the size estimate
      airM3h: 1800,                          // airflow of the air exchange when on (m³/h)
```

- [ ] **3.7** `controller.js`, line 177. Replace:

```js
        fan: { auto: true, level: 1 },
```

with:

```js
        air: { auto: true, on: false },
```

- [ ] **3.8** `controller.js`, lines 205–226: replace everything from the line that starts with `const LVL_RANK = { critical: 3, serious: 2, warning: 1 };` up to, not including, the line that starts with `const say = (t, lvl, text) => emit({ t, lvl, text });`, with:

```js
  const LVL_RANK = { critical: 3, serious: 2, warning: 1 };
  // m:ss for a number of seconds
  const mss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // State of the purge cycle (contract C9 section 5.3)
  function airInit() {
    return { state: 'idle', since: null, purgeStart: null, capRun: 0, prepT: 0, prepRH: 0, nextPurgeS: null, delayed: false, timed: false, sizeText: null };
  }
  function freshState(cfg) {
    return {
      lastT: null, sensors: {}, alarms: {}, v: {}, f: {},
      rhLocked: false, co2SafetyOn: false,
      trim: 0, acMode: 'cool', dryOn: false, heatSince: null, coolSince: null, drySince: null,
      stage: { since: null, flush: 1, ramp: null, done: false }, harvestOn: false, harvestWin: null, harvestFog: false,
      huOn: false, fanDryOn: false, fogCoolOn: false, fogFullSince: null,
      acLimitSince: null, alarmPend: {}, rhT: cfg.spRH, vpd: null, vpdT: null,
      resp: { RH: { n: 0, win: null, fault: false }, CO2: { n: 0, win: null, fault: false } },
      air: airInit(), airReason: null, airPts: [], airRate: null, airRunCapped: false,
      req: { ac: { power: true, mode: 'cool', setpoint: cfg.spT, fan: 'auto' }, hu: { level: 0 }, air: { on: false }, lights: { on: false }, circ: { on: false } },
      cmd: { ac: { power: true, mode: 'cool', setpoint: cfg.spT, fan: 'auto' }, hu: { level: 0 }, air: { on: false }, lights: { on: false }, circ: { on: false } },
      out: { air: { since: null }, hu: { since: null }, ac: { last: null } },
      hold: { ac: '', hu: '', air: '' },
      why: { ac: '', hu: '', air: '', lights: '', circ: '' },
      stats: { airOnS: 0, purges: 0, purgeS: 0, longestPurgeS: 0, cappedPurges: 0, delayedS: 0, fogStarts: 0, acCmds: 0 },
      purgeRec: { cur: null, events: [], hours: [] },
      prev: null,
    };
  }

  function create(cfg, snapshot, onEvent) {
    const emit = onEvent || (() => {});
    let st = snapshot ? structuredClone(snapshot) : freshState(cfg);
```

- [ ] **3.9** `controller.js`, lines 450–505: replace everything from the line that starts with `// ---------- 2. Rules ----------` up to, not including, the line that starts with `// P4: AC by mode and setpoint.`, with:

```js
    // ---------- 2. Purge cycle (contract C9 section 5) ----------
    function setState(state, t) {
      if (st.air.state !== state) { st.air.state = state; st.air.since = t; }
    }
    function startPurge(t) {
      setState('purge', t);
      st.air.purgeStart = t;
      st.stats.purges++;
    }
    // End of a purge. capped: true = the time cap, false = the stop level, null = manual control, a CO2 fault or a safety run.
    function endPurge(t, capped) {
      const A = st.air, runS = t - A.purgeStart;
      st.stats.purgeS += runS;
      st.stats.longestPurgeS = Math.max(st.stats.longestPurgeS, runS);
      A.purgeStart = null;
      setState('after', t);
      if (capped === true) {
        A.capRun++;
        st.stats.cappedPurges++;
        hourBucket(Math.floor(t / 3600)).cappedN++;
        st.airRunCapped = true;                // the record's event gets capped: true when the air run ends
        say(t, 'info', `Purge stopped at the time cap (${mss(runS)})`);
      } else if (capped === false) A.capRun = 0;
    }
    // P1 CO2 safety level and the purge states. Runs before the AC and the fogger.
    function airPlan(v, f, t, prevOn) {
      const R = cfg.rules, A = st.air;
      // P1 CO2 safety level, off 20 ppm below it
      st.co2SafetyOn = R.co2Safety && !f.CO2 && v.CO2 >= (st.co2SafetyOn ? R.co2SafetyAt - 20 : R.co2SafetyAt);
      if (!cfg.manual.air.auto || f.CO2 || st.co2SafetyOn) {
        // No purge cycle: the grower, the timed purge or the safety run (airExchange) runs the air exchange.
        // A safety run is not a purge (5.3): a purge running when it starts ends here, not capped.
        if (A.state === 'purge') endPurge(t, null);
        setState('idle', t);
        A.nextPurgeS = st.co2SafetyOn ? 0 : null; A.prepT = 0; A.prepRH = 0; A.delayed = false;
        if (!st.co2SafetyOn) st.rhLocked = false;
        return;
      }
      // States (5.3). offFor: how long the air exchange has been off (0 while on).
      const on = st.cmd.air.on, offFor = on ? 0 : st.out.air.since == null ? Infinity : t - st.out.air.since;
      if (A.state === 'purge') {
        const runS = t - A.purgeStart;
        if (v.CO2 <= R.fanOff && runS >= AIR_MIN_ON_S) endPurge(t, false);
        else if (runS >= R.purgeMaxS) endPurge(t, true);
      }
      if (A.state === 'after' && !on && offFor >= R.minOffS) setState('idle', t);
      if (A.state === 'idle' || A.state === 'prepare') {
        if (v.CO2 >= R.fanOn && (on || offFor >= R.minOffS)) startPurge(t);
        else setState('idle', t);
      }
    }
```

- [ ] **3.10** `controller.js`, line 536. Replace:

```js
      if (!st.setbackOn) st.trim = clamp(st.trim - clamp(e, -2, 2) * dt / TRIM_TI, -3, 3);
```

with:

```js
      st.trim = clamp(st.trim - clamp(e, -2, 2) * dt / TRIM_TI, -3, 3);
```

- [ ] **3.11** `controller.js`, lines 547–564: replace everything from the line that starts with `const mode = st.dryOn ? 'dry' : st.acMode;` up to, not including, the line that starts with `// AC fan speed (2.6)`, with:

```js
      const mode = st.dryOn ? 'dry' : st.acMode;
      const sp = cfg.spT + st.trim;
      const corr = `Setpoint correction ${st.trim >= 0 ? '+' : ''}${st.trim.toFixed(1)} °C for the AC sensor.`;
      q.power = true;
      let why = mode === 'dry' ? `Humidity is ${(v.RH - st.rhT).toFixed(0)} % above the target and outdoor air is too wet: dry mode.`
        : Math.abs(e) <= 0.3 ? `Room is at the target. ${corr}`
        : `Room is ${Math.abs(e).toFixed(1)} °C ${e > 0 ? 'above' : 'below'} the target. ${corr}`;
```

- [ ] **3.12** `controller.js`, lines 621–626. Delete:

```js
      // During a purge, the incoming air is drier: fog one level more. The fogger never stops for a purge.
      const purging = st.fanCo2On && !st.purgeHeld;
      if (R.fogBoost && !crop.noFogBoost && purging && v.RH < st.rhT + 1 && lv < 3) {
        lv += 1;
        why += ' CO₂ purge: one level more for the dry incoming air.';
      }
```

- [ ] **3.13** `controller.js`, lines 629–668: replace everything from the line that starts with `function exhaustFan(v, f) {` up to, not including, the line that starts with `// Lights (2.2)`, with:

```js
    // The air exchange request (C9 5.6): manual, then P1 safety, P3 purge, P4 free cooling and drying.
    // Returns the reason of the request ('' = off).
    function airExchange(v, f, t) {
      const m = cfg.manual.air, q = st.req.air, R = cfg.rules, A = st.air;
      if (!m.auto) { q.on = !!m.on; st.why.air = 'Manual control. The controller does not change this output.'; return q.on ? 'manual' : ''; }
      // Outdoor drying (hysteresis): RH well above the target and drier outdoor air.
      if (!R.outdoorDry || f.out || f.RH || f.T) st.fanDryOn = false;
      else {
        const ahIn = ahOf(v.T, v.RH), ahOut = ahOf(v.tOut, v.rhOut);
        if (!st.fanDryOn && v.RH > st.rhT + 5 && ahOut < ahIn - 0.5) st.fanDryOn = true;
        else if (st.fanDryOn && (v.RH < st.rhT + 1 || ahOut >= ahIn)) st.fanDryOn = false;
      }
      // Free cooling: the room is warm and outdoor air is at least 3 °C cooler.
      const cool = R.freeCool && !f.out && !f.T && v.T - cfg.spT > 0.3 && v.tOut < v.T - 3;
      const reason = st.co2SafetyOn ? 'safety' : A.state === 'purge' ? 'purge' : cool ? 'free cooling' : st.fanDryOn ? 'drying' : '';
      q.on = reason !== '';
      st.why.air = airWhy(v, reason);
      return reason;
    }
    // Plain-language reason for the air exchange (C9 5.7)
    function airWhy(v, reason) {
      const R = cfg.rules, A = st.air, t = st.lastT;
      if (reason === 'safety') return `CO₂ is ${ppm(v.CO2)} ppm, at or above the safety level ${R.co2SafetyAt}. The air exchange runs even when humidity is low.`;
      if (A.state === 'purge') return `Purging since ${mss(t - A.purgeStart)} (at most ${mss(R.purgeMaxS)}). It stops at ${R.fanOff} ppm.`;
      if (reason === 'free cooling') return `Outdoor air is ${(v.T - v.tOut).toFixed(1)} °C cooler. The air exchange runs to help the AC.`;
      if (reason === 'drying') return 'Humidity is high and outdoor air is drier. The air exchange runs to dry the room.';
      if (A.state === 'after') {
        const offAt = st.cmd.air.on ? t : st.out.air.since ?? t;
        return `Minimum off time: ${Math.max(0, Math.ceil(R.minOffS - (t - offAt)))} s.`;
      }
      return `CO₂ is ${ppm(v.CO2)} ppm. The next purge starts at ${R.fanOn} ppm.`;
    }
```

- [ ] **3.14** `controller.js`, lines 688–689. Replace:

```js
    // after the fan starts. 2 failed checks in a row = the sensor "does not respond".
    function responseCheck(r, prevFog, prevFan) {
```

with:

```js
    // after the air exchange starts. 2 failed checks in a row = the sensor "does not respond".
    function responseCheck(r, prevFog, prevOn) {
```

- [ ] **3.15** `controller.js`, line 705. Replace:

```js
      watch('CO2', prevFan === 0 && c.fan.level > 0, RESP_WIN_CO2, 5);
```

with:

```js
      watch('CO2', !prevOn && c.air.on, RESP_WIN_CO2, 5);
```

- [ ] **3.16** `controller.js`, lines 708–724: replace everything from the line that starts with `// ---------- 3. Machine protection ----------` up to, not including, the line that starts with `function protectAc(t) {`, with:

```js
    // ---------- 4. Machine protection ----------
    // Fogger: on/off changes wait for the minimum on or off time. Level changes while on are free.
    function protectOnOff(dev, minOnMin, minOffMin, t) {
      const o = st.out[dev], c = st.cmd[dev], want = st.req[dev].level;
      const isOn = c.level > 0, wantOn = want > 0;
      st.hold[dev] = '';
      if (isOn === wantOn) { c.level = want; return; }
      const manual = !cfg.manual[dev].auto;
      const min = (isOn ? minOnMin : minOffMin) * 60, age = o.since == null ? Infinity : t - o.since;
      if (manual || age >= min) {
        c.level = want; o.since = t;
        if (wantOn) st.stats.fogStarts++;
      } else {
        st.hold[dev] = `${isOn ? 'Minimum run time' : 'Minimum off time'}: ${Math.ceil((min - age) / 60)} min to wait.`;
      }
    }
    // Air exchange: every run lasts AIR_MIN_ON_S, then stays off rules.minOffS. A manual change acts at once;
    // the CO2 safety level starts the fans at once, and its end (safetyExit) stops them at once.
    function protectAir(t, safetyExit) {
      const o = st.out.air, c = st.cmd.air, want = st.req.air.on;
      st.hold.air = '';
      if (c.on === want) return;
      const min = c.on ? AIR_MIN_ON_S : cfg.rules.minOffS, age = o.since == null ? Infinity : t - o.since;
      if (!cfg.manual.air.auto || age >= min || (c.on ? safetyExit : st.co2SafetyOn)) { c.on = want; o.since = t; }
      else st.hold.air = `${c.on ? 'Minimum run time' : 'Minimum off time'}: ${Math.ceil(min - age)} s to wait.`;
    }
```

- [ ] **3.17** `controller.js`, lines 746–761: replace everything from the line that starts with `// ---------- 4. Exhaust record ----------` up to, not including, the line that starts with `function addAcFan(t0, t1, fan) {`, with:

```js
    // ---------- 5. Purge record ----------
    function hourBucket(h) {
      const H = st.purgeRec.hours;
      let b = H[H.length - 1];
      if (!b || b.h !== h) { b = { h, runS: 0, starts: 0, m3: 0, cappedN: 0, fogLS: 0, acHighS: 0, acLowS: 0 }; H.push(b); if (H.length > 168) H.shift(); }   // 7 days
      return b;
    }
    // Run time and air volume from t0 to t1 with the air exchange on, split at each full hour.
    function addRun(t0, t1) {
      const q = cfg.airM3h / 3600;
      for (let a = t0; a < t1;) {
        const h = Math.floor(a / 3600), b = Math.min(t1, (h + 1) * 3600), bk = hourBucket(h);
        bk.runS += b - a; bk.m3 += q * (b - a); a = b;
      }
      if (st.purgeRec.cur) st.purgeRec.cur.m3 += q * (t1 - t0);
    }
```

- [ ] **3.18** `controller.js`, lines 779–780. Replace:

```js
    function historyFor(key, t, before) {
      const H = st.exh.hours;
```

with:

```js
    function historyFor(key, t, before) {
      const H = st.purgeRec.hours;
```

- [ ] **3.19** `controller.js`, lines 790–825: replace everything from the line that starts with `function recordExhaust(prevLvl, t, v) {` up to, not including, the line that starts with `// Call once for each new sensor reading.`, with:

```js
    // One event per air run (C9 5.7): reason at the start, CO2 at the start and the end, air volume, capped.
    function recordPurges(prevOn, t, v) {
      const on = st.cmd.air.on, X = st.purgeRec;
      if (!prevOn && on) {
        X.cur = { start: t, end: null, reason: st.airReason, co2Start: v.CO2, co2End: null, m3: 0, capped: false };
        st.airRunCapped = false;
        hourBucket(Math.floor(t / 3600)).starts++;
      } else if (prevOn && !on && X.cur) {
        X.cur.end = t; X.cur.co2End = v.CO2; X.cur.capped = st.airRunCapped;
        X.events.push(X.cur); if (X.events.length > 200) X.events.shift();
        X.cur = null;
      }
    }

    // ---------- Event log ----------
    function log(t) {
      const c = st.cmd, A = st.air, X = st.purgeRec;
      const now = { power: c.ac.power, mode: c.ac.mode, airOn: c.air.on, airReason: st.airReason, fogOn: c.hu.level > 0, lights: c.lights.on,
        delayed: A.delayed, safety: st.co2SafetyOn, timed: A.timed };
      const p = st.prev || now;
      const man = d => (cfg.manual[d].auto ? '' : ' (manual)');
      if (now.power !== p.power) say(t, 'info', (now.power ? 'AC on' : 'AC off') + man('ac'));
      if (now.mode !== p.mode) say(t, 'info', `AC mode: ${now.mode}` + man('ac'));
      if (now.safety !== p.safety) say(t, now.safety ? 'critical' : 'good', now.safety ? 'CO₂ safety level: the air exchange runs, ignoring the time cap' : 'CO₂ below the safety level');
      if (now.fogOn !== p.fogOn) say(t, 'info', (now.fogOn ? 'Fogger on' : 'Fogger off') + man('hu'));
      if (now.lights !== p.lights) say(t, 'info', now.lights ? 'Lights on' : 'Lights off');
      if (now.airOn && !p.airOn) say(t, 'info', `Air exchange on: ${now.airReason}`);
      else if (!now.airOn && p.airOn) {
        const e = X.events[X.events.length - 1];
        say(t, 'info', `Air exchange off (${mss(e && e.end === t ? e.end - e.start : 0)}, CO₂ ${ppm(st.v.CO2)} ppm)`);
      } else if (now.airOn && now.airReason && now.airReason !== p.airReason) say(t, 'info', `Air exchange: ${now.airReason}`);
      st.prev = now;
    }
```

- [ ] **3.20** `controller.js`, lines 824–864: replace everything from the line that starts with `// Call once for each new sensor reading.` up to, not including, the line that starts with `// Status of one measured value, for the display.`, with:

```js
    // Call once for each new sensor reading. The commands stay the same until the next reading.
    function update(r) {
      const dt = st.lastT == null ? 0 : Math.max(0, r.t - st.lastT);
      const prevOn = st.cmd.air.on, prevFog = st.cmd.hu.level, wasSafe = st.co2SafetyOn;
      if (prevOn && dt > 0) addRun(st.lastT, r.t);
      if (prevFog > 0 && dt > 0) addFog(st.lastT, r.t, prevFog);
      if (dt > 0 && st.cmd.ac.power) addAcFan(st.lastT, r.t, st.cmd.ac.fan);
      st.lastT = r.t;
      // Time since the last reading, with the commands that were active in that time.
      if (prevOn) st.stats.airOnS += dt;
      if (st.air.delayed) st.stats.delayedS += dt;

      program(r);
      const { v, f } = validate(r);
      st.v = v; st.f = f;
      // Humidity target now (2.5). In VPD mode it moves with the temperature, so the evaporation from the caps stays.
      st.vpdT = es(cfg.spT) * (1 - cfg.spRH / 100);
      st.rhT = cfg.humMode === 'vpd' && !f.T ? clamp(100 * (1 - st.vpdT / es(v.T)), 50, 99) : cfg.spRH;
      st.vpd = !f.T && !f.RH ? es(v.T) * (1 - v.RH / 100) : null;
      alarms(v, f, r.t);
      airPlan(v, f, r.t, prevOn);
      airConditioner(v, f, dt);
      fogger(v, f, r.t);
      const reason = airExchange(v, f, r.t);
      lights(r);
      circulation(v, r.t);
      protectAir(r.t, wasSafe && !st.co2SafetyOn);
      st.airReason = st.cmd.air.on ? reason || st.airReason : null;    // C9 5.3: follows the run; null when off
      protectOnOff('hu', cfg.protect.fogMinOn, cfg.protect.fogMinOff, r.t);
      protectAc(r.t);
      st.cmd.lights.on = st.req.lights.on;
      st.cmd.circ.on = st.req.circ.on;
      responseCheck(r, prevFog, prevOn);
      recordPurges(prevOn, r.t, v);
      log(r.t);
      return st.cmd;
    }
```

- [ ] **3.21** `controller.js`, lines 882–883. Replace:

```js
      if (st.fanCo2On && st.fanBlocked) return { lvl: 'info', icon: '❚❚', text: 'Purge held (RH)' };
      return st.fanCo2On ? { lvl: 'info', icon: '▲', text: 'Purge on' } : { lvl: 'good', icon: '✓', text: 'Below limit' };
```

with:

```js
      if (st.airReason === 'safety') return { lvl: 'serious', icon: '◆', text: 'Safety run' };   // before the co2Safe alarm
      if (st.air.state === 'purge') return { lvl: 'info', icon: '▲', text: 'Purging' };
      return { lvl: 'good', icon: '✓', text: 'Below limit' };
```

- [ ] **3.22** `controller.js`, line 887. Replace:

```js
    return { update, status, ack, alarmList, exhaust: () => st.exh,
```

with:

```js
    return { update, status, ack, alarmList, purges: () => st.purgeRec,
```

- [ ] **3.23** `controller.js`, lines 891–910: replace everything from the line that starts with `const SETTINGS_FORMAT = 'mushroom-climate-settings', SETTINGS_VERSION = 1;` up to, not including, the line that starts with `// Settings of the one fresh-air fan, removed by contract C9.`, with:

```js
  const SETTINGS_FORMAT = 'mushroom-climate-settings', SETTINGS_VERSION = 2;
  // Number limits ("a.b" = cfg.a.b). Numbers without a limit only need the right type.
  const SETTING_LIMITS = {
    spT: [10, 35], spRH: [40, 99], co2Lim: [400, 20000], roomM3: [1, 100000], airM3h: [50, 10000],
    'rules.co2SafetyAt': [500, 20000], 'rules.rhStop': [1, 20], 'rules.rhResume': [0, 19], 'rules.fanOn': [450, 20000],
    'rules.fanOff': [400, 20000], 'rules.purgeMaxS': [60, 900], 'rules.prepareLeadS': [0, 900], 'rules.minOffS': [30, 600],
    'protect.fogMinOn': [0, 30], 'protect.fogMinOff': [0, 30],
    'protect.acMinCmd': [0, 30], 'protect.timedPurgeOn': [1, 60], 'protect.timedPurgeEvery': [5, 240], 'protect.faultFogLevel': [1, 3],
    'program.rampH': [0, 48], 'program.flushes': [1, 10], 'program.days.spawn': [1, 90], 'program.days.pinning': [1, 30],
    'program.days.fruiting': [1, 60], 'program.days.rest': [1, 60], 'program.harvest.dryMin': [0, 240],
    'program.harvest.pickMin': [0, 240], 'program.harvest.floorDrop': [1, 15], 'program.lights.on': [0, 1439], 'program.lights.off': [0, 1439],
    'offsets.T': [-5, 5], 'offsets.RH': [-15, 15], 'offsets.CO2': [-500, 500],
    'manual.ac.setpoint': [16, 30], 'manual.hu.level': [0, 3],
  };
  const SETTING_ENUMS = {
    farmType: Object.keys(FARM_TYPES), crop: Object.keys(CROPS), stage: Object.keys(STAGES), humMode: ['vpd', 'rh'],
    sensorMode: ['average', 'worst', 'main'], circ: ['auto', 'on', 'off'], 'manual.ac.mode': ['cool', 'heat', 'dry', 'fan'],
  };
```

- [ ] **3.24** `controller.js`, lines 940–941. Replace:

```js
    const warnings = [];
    if (file.version > SETTINGS_VERSION)
```

with:

```js
    const warnings = [];
    let src = file.settings;
    // An older file (version 1, or no version): drop the removed settings first, with a warning for each.
    if (!(file.version >= 2)) { const up = upgradeSettings(src); src = up.settings; warnings.push(...up.warnings); }
    if (file.version > SETTINGS_VERSION)
```

- [ ] **3.25** `controller.js`, line 965. Replace:

```js
    })(out, file.settings, '');
```

with:

```js
    })(out, src, '');
```

- [ ] **3.26** `controller.js`, line 970. Delete:

```js
    if (R.acOn > R.acOff - 50) { warnings.push('AC "until" level must be at least 50 ppm below the "from" level: corrected.'); R.acOn = R.acOff - 50; }
```

- [ ] **Step 4: Run the tests.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 41`, `# fail 0` (controller 32, settings 9).
- [ ] **Step 5: Check that the old model is gone.**

```bash
grep -nE "fanCo2On|purgeHeld|purgeReduced|setback|airLevel|AIR_STEP_S|fogBoost|fanM3h|fanLevels|st\.exh|fanReason|fanBlocked|co2Timed|cmd\.fan|req\.fan|acPurge|timedOnS|timedSource" controller.js
```

Expected: exactly 2 lines: line 24 (the old header comment, rewritten in task 9) and the first line of `REMOVED_SETTINGS` (line 910).

- [ ] **Step 6: Commit.**

```bash
git add controller.js tests/controller.test.js tests/settings.test.js
git commit -m "feat(controller): air exchange on/off with the purge cycle, settings version 2 (C9 5.1-5.3, 5.6, 5.7)"
```

## Task 3: Rise rate and Prepare (C9 5.4)

**Files:** Modify `controller.js` (`AIR_POINTS`, `pushes`, `prepOf`, `airPlan`, `airConditioner`, `fogger`, `airWhy`, `status`). Test: `tests/controller.test.js`.

| Rule (C9 5.4) | Code |
|---|---|
| Points: good CO₂ readings since the last air run ended, at most 20 | `airPlan`: cleared while the fans were on in the last interval (`prevOn`); a reading counts when `CO2` or `CO2b` was good at this step |
| `nextPurgeS` | `0` at or above `fanOn`; `(fanOn − CO2) / rate` when `rate > 0`; else `null` |
| Gap rule | `gapS = (fanOn − fanOff) / rate` when `rate > 0`, else `null`. Prepare starts only when `gapS ≥ 2 × prepareLeadS` (and `0 < nextPurgeS ≤ prepareLeadS`). Defaults: purges at least 360 s apart, a rise of at most 0.56 ppm/s. |
| `prepT`, `prepRH` | `prepOf(push, band)`: `−0.5 × band` for a push ≥ 0.5, `+0.5 × band` for a push ≤ −0.5, else 0 (±0.5 °C, ±1.5 %) |
| Unknown push | `pushes()` gives `null` with an outdoor fault (`f.out`), and also with a room `T` fault (both) or `RH` fault (humidity) |
| Where they act | In `prepare`, and in the `purge` that follows a `prepare` (`st.airPrepared`, set in `startPurge`); never when `rules.prepare` is off. A purge that starts from `idle` (purges too frequent) moves no target. |

- [ ] **Step 1: Write the failing tests.** Apply this edit.

- [ ] **1.1** `tests/controller.test.js`: append at the end of the file (after line 389), after one blank line:

```js
// A CO2 rise of 0.5 ppm/s from 760 ppm, read every 30 s up to 120 s: at 120 s the next purge is 160 s away (lead 180 s),
// and purges are 400 s apart ((900 - 700) / 0.5), at least 2 x 180 s: Prepare acts.
function prepared(o = {}, rules = {}) {
  const m = make({ rules, protect: { acMinCmd: 0 } });
  for (let t = 0; t <= 120; t += 30) m.feed(t, { CO2: 760 + t / 2, ...o });
  return m;
}

test('Prepare starts from the predicted rise and ends when the prediction is too far away', () => {
  const { ctl, feed, cfg } = prepared();
  assert.equal(ctl.state.air.state, 'prepare');
  assert.ok(Math.abs(ctl.state.air.nextPurgeS - 160) < 1e-6, `next purge in ${ctl.state.air.nextPurgeS} s`);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'info', icon: '◷', text: 'Purge soon' });
  assert.match(ctl.state.why.air, /^Purge in about 3 min: the AC aims at 24\.5 °C, the fogger at \d+ %\.$/);
  cfg.rules.prepareLeadS = 60;
  feed(150, { CO2: 835 });                                      // purge in 130 s > 60 s
  assert.equal(ctl.state.air.state, 'idle');
  assert.deepEqual([ctl.state.air.prepT, ctl.state.air.prepRH], [0, 0]);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'good', icon: '✓', text: 'Below limit' });
});

test('Prepare: the AC and the fogger move away from the push of the purge, in four directions', () => {
  const cases = [
    { name: 'warm, wet outdoor air', tOut: 33, rhOut: 60, T: -0.5, RH: -1.5 },
    { name: 'cool, dry outdoor air', tOut: 18, rhOut: 50, T: 0.5, RH: 1.5 },
    { name: 'warm, dry outdoor air', tOut: 30, rhOut: 40, T: -0.5, RH: 1.5 },
    { name: 'cool, wet outdoor air', tOut: 24, rhOut: 100, T: 0.5, RH: -1.5 },
  ];
  for (const c of cases) {
    const { ctl } = prepared({ T: 25, RH: 88, tOut: c.tOut, rhOut: c.rhOut });
    assert.equal(ctl.state.air.state, 'prepare', c.name);
    assert.ok(Math.abs(ctl.state.air.prepT - c.T) < 1e-9, `${c.name}: prepT ${ctl.state.air.prepT}`);
    assert.ok(Math.abs(ctl.state.air.prepRH - c.RH) < 1e-9, `${c.name}: prepRH ${ctl.state.air.prepRH}`);
  }
});

test('Prepare: a small push or no outdoor reading changes nothing', () => {
  const small = prepared({ T: 25, RH: 88, tOut: 25.3, rhOut: 86.5 });
  assert.equal(small.ctl.state.air.state, 'prepare');
  assert.deepEqual([small.ctl.state.air.prepT, small.ctl.state.air.prepRH], [0, 0]);
  const none = prepared({ tOut: null, rhOut: null });
  assert.equal(none.ctl.state.f.out, true);
  assert.equal(none.ctl.state.air.state, 'prepare');
  assert.deepEqual([none.ctl.state.air.prepT, none.ctl.state.air.prepRH], [0, 0]);
});

test('Prepare: the AC and fogger targets move in prepare and purge, and come back after the purge', () => {
  const o = { RH: 85.8, tOut: 33, rhOut: 60 };                  // warm, wet outdoor air: AC -0.5 °C, fogger -1.5 %
  const { ctl, feed } = make({ protect: { acMinCmd: 0 } });
  for (let t = 0; t <= 60; t += 30) feed(t, { CO2: 780 + t / 2, ...o });
  assert.equal(ctl.state.air.state, 'idle', '3 readings: no rise rate yet');
  assert.equal(ctl.state.cmd.ac.setpoint, 25);
  assert.equal(ctl.state.cmd.hu.level, 2, 'deficit 3.2 %: level 2');
  feed(90, { CO2: 825, ...o });                                  // 0.5 ppm/s: purge in 150 s, purges 400 s apart
  assert.equal(ctl.state.air.state, 'prepare');
  assert.equal(ctl.state.cmd.ac.setpoint, 24.5, 'the AC aims at 24.5 °C');
  assert.equal(ctl.state.cmd.hu.level, 1, 'the fogger aims 1.5 % lower: deficit 1.7 %');
  assert.match(ctl.state.why.ac, /Prepare for a purge: the AC aims at 24\.5 °C\./);
  feed(120, { CO2: 900, ...o });
  assert.equal(ctl.state.air.state, 'purge');
  assert.equal(ctl.state.cmd.ac.setpoint, 24.5, 'held during the purge');
  feed(150, { CO2: 690, ...o });
  assert.equal(ctl.state.air.state, 'after');
  assert.deepEqual([ctl.state.air.prepT, ctl.state.air.prepRH], [0, 0]);
  assert.equal(ctl.state.cmd.ac.setpoint, 25);
  assert.equal(ctl.state.cmd.hu.level, 2);
});

test('rules.prepare = false: no Prepare state and no offsets in a purge', () => {
  const { ctl, feed } = prepared({}, { prepare: false });
  assert.equal(ctl.state.air.state, 'idle');
  assert.ok(ctl.state.air.nextPurgeS > 0, 'the prediction is still made');
  feed(150, { CO2: 900 });
  assert.equal(ctl.state.air.state, 'purge');
  assert.deepEqual([ctl.state.air.prepT, ctl.state.air.prepRH], [0, 0]);
});

test('Prepare acts only when purges are far apart: (fanOn - fanOff) / rate >= 2 x prepareLeadS', () => {
  const fast = make({ protect: { acMinCmd: 0 } });
  for (let t = 0; t <= 120; t += 30) fast.feed(t, { CO2: 650 + t });   // 1 ppm/s: a purge every 200 s, under 360 s
  assert.ok(Math.abs(fast.ctl.state.air.nextPurgeS - 130) < 1e-6, 'the next purge is inside the lead time');
  assert.equal(fast.ctl.state.air.state, 'idle', 'frequent purges: no Prepare');
  fast.feed(150, { CO2: 950 });
  assert.equal(fast.ctl.state.air.state, 'purge');
  assert.deepEqual([fast.ctl.state.air.prepT, fast.ctl.state.air.prepRH], [0, 0], 'a purge without Prepare moves no target');
  const slow = prepared();                                       // 0.5 ppm/s: a purge every 400 s
  assert.equal(slow.ctl.state.air.state, 'prepare');
  slow.cfg.rules.prepareLeadS = 240;                             // 2 x 240 s = 480 s > 400 s
  slow.feed(150, { CO2: 835 });
  assert.equal(slow.ctl.state.air.state, 'idle', 'purges closer than 2 x the lead: Prepare stops');
});

test('the rise rate uses only readings with the fans off', () => {
  const { ctl, feed } = make({ rules: { prepare: false } });
  for (let t = 0; t <= 90; t += 30) feed(t, { CO2: 650 + t });
  assert.equal(ctl.state.airPts.length, 4);
  feed(120, { CO2: 950 });                                      // purge
  feed(150, { CO2: 690 });                                      // the fans were on: points cleared
  assert.deepEqual(ctl.state.airPts, []);
  assert.equal(ctl.state.air.nextPurgeS, null, 'no rise rate yet');
  for (let t = 180; t <= 30 * 40; t += 30) feed(t, { CO2: 690 + (t - 150) * 0.1 });
  assert.equal(ctl.state.airPts.length, 20, 'at most the last 20 readings');
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/controller.test.js` → expected `# pass 32`, `# fail 7` (the 7 new tests; `AssertionError`s such as `'idle' !== 'prepare'`).
- [ ] **Step 3: Implement.** Apply these edits in order.

- [ ] **3.1** `controller.js`, line 222. Replace:

```js
      air: airInit(), airReason: null, airPts: [], airRate: null, airRunCapped: false,
```

with:

```js
      air: airInit(), airReason: null, airPts: [], airRate: null, airRunCapped: false, airPrepared: false,
```

- [ ] **3.2** `controller.js`, lines 454–455. Replace:

```js
    function startPurge(t) {
      setState('purge', t);
```

with:

```js
    function startPurge(t) {
      st.airPrepared = st.air.state === 'prepare';            // the Prepare offsets stay on in this purge (5.4)
      setState('purge', t);
```

- [ ] **3.3** `controller.js`, line 117. Replace:

```js
  const AIR_MIN_ON_S = 30;         // every air run lasts at least this long, so a noisy reading cannot stop it at once
```

with:

```js
  const AIR_MIN_ON_S = 30;         // every air run lasts at least this long, so a noisy reading cannot stop it at once
  const AIR_POINTS = 20;           // CO2 readings kept for the rise rate
```

- [ ] **3.4** `controller.js`, line 451. Replace:

```js
    // ---------- 2. Purge cycle (contract C9 section 5) ----------
```

with:

```js
    // ---------- 2. Purge cycle (contract C9 section 5) ----------
    // Push of a purge: outdoor minus room, temperature (°C) and absolute humidity (g/m³). null = not known.
    function pushes(v, f) {
      return {
        T: f.out || f.T ? null : v.tOut - v.T,
        AH: f.out || f.T || f.RH ? null : ahOf(v.tOut, v.rhOut) - ahOf(v.T, v.RH),
      };
    }
    // Prepare offset (5.4): half the band, on the side away from the push; 0 for a push under 0.5 or an unknown push.
    const prepOf = (push, band) => (push == null ? 0 : push >= 0.5 ? -0.5 * band : push <= -0.5 ? 0.5 * band : 0);
```

- [ ] **3.5** `controller.js`, lines 485–487. Replace:

```js
    // P1 CO2 safety level and the purge states. Runs before the AC and the fogger.
    function airPlan(v, f, t, prevOn) {
      const R = cfg.rules, A = st.air;
```

with:

```js
    // Rise rate and prediction, P1 CO2 safety level, the purge states and the Prepare offsets.
    // Runs before the AC and the fogger, which use st.air.prepT and st.air.prepRH.
    function airPlan(v, f, t, prevOn) {
      const R = cfg.rules, A = st.air, AIR = global.ClimateAir;
      // Rise rate: the good CO2 readings since the last air run ended (at most AIR_POINTS)
      if (prevOn) st.airPts = [];
      else if (!f.CO2 && ['CO2', 'CO2b'].some(k => st.sensors[k] && st.sensors[k].goodT === t)) {
        st.airPts.push({ t, C: v.CO2 });
        if (st.airPts.length > AIR_POINTS) st.airPts.shift();
      }
      const rate = AIR.riseRate(st.airPts);
```

- [ ] **3.6** `controller.js`, line 507. Replace:

```js
      // States (5.3). offFor: how long the air exchange has been off (0 while on).
```

with:

```js
      A.nextPurgeS = v.CO2 >= R.fanOn ? 0 : rate > 0 ? (R.fanOn - v.CO2) / rate : null;
      const gapS = rate > 0 ? (R.fanOn - R.fanOff) / rate : null;            // expected time between purges (5.4)
      const push = pushes(v, f);
      // States (5.3). offFor: how long the air exchange has been off (0 while on).
```

- [ ] **3.7** `controller.js`, lines 519–522. Replace:

```js
        if (v.CO2 >= R.fanOn && (on || offFor >= R.minOffS)) startPurge(t);
        else setState('idle', t);
      }
    }
```

with:

```js
        if (v.CO2 >= R.fanOn && (on || offFor >= R.minOffS)) startPurge(t);
        else {
          // Prepare only when purges are far apart: with frequent purges it would hold the room at the band edge.
          const far = gapS != null && gapS >= 2 * R.prepareLeadS;
          setState(R.prepare && far && A.nextPurgeS > 0 && A.nextPurgeS <= R.prepareLeadS ? 'prepare' : 'idle', t);
        }
      }
      // Prepare offsets (5.4): in prepare, and in a purge that followed a prepare
      const act = R.prepare && (A.state === 'prepare' || (A.state === 'purge' && st.airPrepared));
      A.prepT = act ? prepOf(push.T, BANDS.T) : 0;
      A.prepRH = act ? prepOf(push.AH, BANDS.RH) : 0;
    }
```

- [ ] **3.8** `controller.js`, line 550. Replace:

```js
      let e = v.T - cfg.spT, coreNote = '';
```

with:

```js
      // Prepare (C9 5.4): in prepare and purge the AC aims at spT + prepT.
      const spT = cfg.spT + st.air.prepT;
      let e = v.T - spT, coreNote = '';
```

- [ ] **3.9** `controller.js`, line 573. Replace:

```js
st.acMode !== 'heat' && !fanCanDry && v.T > cfg.spT - 1 && e < 0.5;
```

with:

```js
st.acMode !== 'heat' && !fanCanDry && v.T > spT - 1 && e < 0.5;
```

- [ ] **3.10** `controller.js`, line 577. Replace:

```js
(v.RH < st.rhT + 1 || v.T < cfg.spT - 1.5 || st.acMode === 'heat' || e > 1)
```

with:

```js
(v.RH < st.rhT + 1 || v.T < spT - 1.5 || st.acMode === 'heat' || e > 1)
```

- [ ] **3.11** `controller.js`, line 580. Replace:

```js
      const sp = cfg.spT + st.trim;
```

with:

```js
      const sp = spT + st.trim;
```

- [ ] **3.12** `controller.js`, line 585. Replace:

```js
        : `Room is ${Math.abs(e).toFixed(1)} °C ${e > 0 ? 'above' : 'below'} the target. ${corr}`;
```

with:

```js
        : `Room is ${Math.abs(e).toFixed(1)} °C ${e > 0 ? 'above' : 'below'} the target. ${corr}`;
      if (st.air.prepT) why += ` Prepare for a purge: the AC aims at ${spT.toFixed(1)} °C.`;
```

- [ ] **3.13** `controller.js`, lines 610–661: replace everything from the line that starts with `function fogger(v, f, t) {` up to, not including, the line that starts with `// The air exchange request (C9 5.6)`, with:

```js
    function fogger(v, f, t) {
      const m = cfg.manual.hu, q = st.req.hu, R = cfg.rules, P = cfg.protect;
      if (!m.auto) { q.level = m.level; st.why.hu = 'Manual control. The controller does not change this output.'; return; }
      // Prepare (C9 5.4): in prepare and purge the fogger aims at rhT + prepRH.
      const rhT = st.rhT + st.air.prepRH;
      if (st.harvestOn) {
        // Drier caps for picking, but not below the harvest floor (hysteresis 1 %).
        const floor = rhT - cfg.program.harvest.floorDrop;
        if (f.RH || alarmOn('rhLo')) st.harvestFog = true;
        else if (!st.harvestFog && v.RH <= floor) st.harvestFog = true;
        else if (st.harvestFog && v.RH >= floor + 1) st.harvestFog = false;
        q.level = !st.harvestFog ? 0 : !f.RH && v.RH < floor - 1 ? 3 : 2;
        st.why.hu = `Harvest window ${hhmm(st.harvestWin.from)}–${hhmm(st.harvestWin.to)}: fog off so the caps are drier for picking.`
          + (st.harvestFog ? ` RH is at the harvest floor ${floor.toFixed(0)} %, so fog level ${q.level}.` : ` Fog comes back below ${floor.toFixed(0)} % RH.`);
        return;
      }
      st.harvestFog = false;
      if (f.RH) {
        // Safe state: copy the average fog of the hours before the fault, in 10 min cycles.
        const learned = P.learnSafe ? historyFor('fogLS', t, st.sensors.RH.faultSince) : null;   // level-seconds per hour
        if (learned != null) {
          const avg = learned / 3600, L = clamp(Math.ceil(avg), 1, 3), onFrac = clamp(avg / L, 0.1, 1);
          q.level = t % 600 < onFrac * 600 ? L : 0;
          st.why.hu = `Humidity sensor fault: fog copies this hour of an earlier day, level ${L} for ${Math.round(onFrac * 10)} min of each 10 min.`;
        } else {
          q.level = t % 1200 < 600 ? P.faultFogLevel : 0;
          st.why.hu = `Humidity sensor fault: fixed fog at level ${P.faultFogLevel}, 10 min on and 10 min off.`;
        }
        return;
      }
      if (!st.huOn && v.RH < rhT - 2 && !st.dryOn) st.huOn = true;
      else if (st.huOn && (v.RH >= rhT + 0.5 || st.dryOn)) st.huOn = false;
      const deficit = rhT + 1 - v.RH;
      let lv = !st.huOn ? 0 : deficit > 4 ? 3 : deficit > 2 ? 2 : 1;
      let why = st.huOn ? `Humidity is ${(rhT - v.RH).toFixed(1)} % below the target.`
        : v.RH > rhT + 5 ? 'Humidity is above the target. The fogger stays off.'
        : 'Humidity is in the band. The unit is on standby.';
      // Fog-first cooling (2.6): when the room is warm, fog cools it by evaporation before the AC must work more.
      const crop = CROPS[cfg.crop], eT = !f.T ? v.T - cfg.spT : 0;
      if (!R.fogCool || f.T) st.fogCoolOn = false;
      else if (!st.fogCoolOn && eT > 0.5 && v.RH < rhT + 1) st.fogCoolOn = true;
      else if (st.fogCoolOn && (eT < 0.1 || v.RH >= rhT + 2.5)) st.fogCoolOn = false;
      if (st.fogCoolOn) {
        const want = eT > 1 ? 2 : 1;
        if (lv < want) { lv = want; why = `Room is ${eT.toFixed(1)} °C warm: fog cools it first (evaporation).`; }
      }
      if (st.air.prepRH) why += ` Prepare for a purge: the fogger aims at ${rhT.toFixed(0)} %.`;
      // Crop flag maxFog: a crop that must not get direct fog.
      if (crop.maxFog && lv > crop.maxFog) { lv = crop.maxFog; why += ` ${crop.name}: fog limited to level ${crop.maxFog} (no direct fog on the crop).`; }
      q.level = lv;
      const fogMax = crop.maxFog || 3;
      st.fogFullSince = lv >= fogMax ? (st.fogFullSince ?? t) : null;
      st.why.hu = why + (lv > 0 ? ` Level ${lv}.` : '');
    }
```

- [ ] **3.14** `controller.js`, lines 691–692. Replace:

```js
      if (A.state === 'after') {
        const offAt
```

with:

```js
      if (A.state === 'prepare') return `Purge in about ${Math.ceil(A.nextPurgeS / 60)} min: the AC aims at ${(cfg.spT + A.prepT).toFixed(1)} °C, the fogger at ${(st.rhT + A.prepRH).toFixed(0)} %.`;
      if (A.state === 'after') {
        const offAt
```

- [ ] **3.15** `controller.js`, line 920. Replace:

```js
      if (st.air.state === 'purge') return { lvl: 'info', icon: '▲', text: 'Purging' };
```

with:

```js
      if (st.air.state === 'purge') return { lvl: 'info', icon: '▲', text: 'Purging' };
      if (st.air.state === 'prepare') return { lvl: 'info', icon: '◷', text: 'Purge soon' };
```

- [ ] **Step 4: Run the tests.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 48`, `# fail 0` (controller 39).
- [ ] **Step 5: Commit.**

```bash
git add controller.js tests/controller.test.js
git commit -m "feat(controller): Prepare from the CO2 rise rate; AC and fogger targets move away from the purge's push (C9 5.4)"
```

## Task 4: Humidity first (C9 5.6, priority 2)

**Files:** Modify `controller.js` (`humidityFirst`, `airPlan`, `airWhy`, `status`, `log`). Test: `tests/controller.test.js`.

| Rule | Code |
|---|---|
| Lock on | `rules.rhLock`, RH ≤ `rhT − rhStop`, the fogger at its maximum for `FOG_FULL_S` (300 s), and `pushAH ≤ −0.5` |
| Lock off | RH ≥ `rhT − rhResume`; also off with an RH fault, in the harvest window, with `rhLock` off |
| Delayed | Locked, not purging, and `fanOn ≤ CO₂ < co2Lim` (a safety run returns before this check). A delayed purge does not start. At `co2Lim` it starts anyway. |
| Running purge | Never stopped by the lock |

- [ ] **Step 1: Write the failing tests.** Apply this edit.

- [ ] **1.1** `tests/controller.test.js`: append at the end of the file (after line 493), after one blank line:

```js
// Drier outdoor air (30 °C, 40 %): a purge would dry the room. RH 83 % is 5 % under the target: fog level 3 (full).
const DRY = { tOut: 30, rhOut: 40 };
const lowRH = t => ({ RH: 83 + (t % 60 ? 0.01 : 0), ...DRY });

test('humidity first: after 5 min of full fog a purge that would dry the room waits, at most until the CO2 limit', () => {
  const { feed, ctl, events } = make({ rules: { prepare: false } });
  for (let t = 0; t <= 270; t += 30) feed(t, { CO2: 850 + (t % 60 ? 1 : 0), ...lowRH(t) });
  assert.equal(ctl.state.cmd.hu.level, 3);
  assert.equal(ctl.state.rhLocked, false, 'fog more before less air');
  feed(300, { CO2: 851, ...lowRH(300) });
  assert.equal(ctl.state.rhLocked, true, 'after 5 min of full fog');
  assert.equal(feed(330, { CO2: 950, ...lowRH(330) }).air.on, false, 'start level, but the purge waits');
  assert.equal(ctl.state.air.delayed, true);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'info', icon: '❚❚', text: 'Purge delayed (RH)' });
  assert.match(ctl.state.why.air, /^Humidity first: RH 83\.0 % is at or below 85 %/);
  assert.ok(events.some(e => e.text === 'Purge delayed: humidity first'));
  assert.equal(feed(360, { CO2: 1000, ...lowRH(360) }).air.on, true, 'CO2 limit: purge anyway');
  assert.equal(ctl.state.air.delayed, false);
  assert.equal(ctl.state.stats.delayedS, 30);
});

test('humidity first: the purge goes when RH recovers; a running purge is never stopped; wet outdoor air never delays', () => {
  const a = make({ rules: { prepare: false } });
  for (let t = 0; t <= 300; t += 30) a.feed(t, { CO2: 850 + (t % 60 ? 1 : 0), ...lowRH(t) });
  assert.equal(a.feed(330, { CO2: 950, ...lowRH(330) }).air.on, false);
  assert.equal(a.feed(360, { CO2: 950, RH: 87.2, ...DRY }).air.on, true, 'RH at the allow level 87 %');
  assert.ok(a.events.some(e => e.text === 'Purge allowed again: humidity recovered'));
  const b = make({ rules: { prepare: false, purgeMaxS: 600 } });
  for (let t = 0; t <= 360; t += 30) b.feed(t, { CO2: 950 + (t % 60 ? 1 : 0), ...lowRH(t) });
  assert.equal(b.ctl.state.rhLocked, true);
  assert.equal(b.ctl.state.cmd.air.on, true, 'the purge that started before the lock goes on');
  assert.equal(b.ctl.state.air.delayed, false);
  const c = make({ rules: { prepare: false } });
  for (let t = 0; t <= 300; t += 30) c.feed(t, { CO2: 850 + (t % 60 ? 1 : 0), RH: 83 + (t % 60 ? 0.01 : 0), tOut: 33, rhOut: 90 });
  assert.equal(c.ctl.state.rhLocked, false, 'wetter outdoor air: a purge does not dry the room');
  assert.equal(c.feed(330, { CO2: 950, RH: 83, tOut: 33, rhOut: 90 }).air.on, true);
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/controller.test.js` → expected `# pass 39`, `# fail 2` (both new tests; the purge starts at 950 ppm).
- [ ] **Step 3: Implement.** Apply these edits in order.

- [ ] **3.1** `controller.js`, line 485. Replace:

```js
    // Rise rate and prediction, P1 CO2 safety level, the purge states and the Prepare offsets.
```

with:

```js
    // P2 humidity first: RH low, the fogger at its maximum for FOG_FULL_S, and a purge that would dry the room.
    // The lock holds a purge that has not started; a running purge goes on. The CO2 limit ends the wait.
    function humidityFirst(v, f, t, pushAH) {
      const R = cfg.rules, A = st.air;
      const stopAt = st.rhT - R.rhStop, resumeAt = st.rhT - R.rhResume;
      if (!R.rhLock || f.RH || st.harvestOn) st.rhLocked = false;
      else if (!st.rhLocked && v.RH <= stopAt && st.fogFullSince != null && t - st.fogFullSince >= FOG_FULL_S && pushAH != null && pushAH <= -0.5) st.rhLocked = true;
      else if (st.rhLocked && v.RH >= resumeAt) st.rhLocked = false;
      A.delayed = st.rhLocked && A.state !== 'purge' && v.CO2 >= R.fanOn && v.CO2 < cfg.co2Lim;
    }
    // Rise rate and prediction, P1 CO2 safety level, P2 humidity first, the purge states and the Prepare offsets.
```

- [ ] **3.2** `controller.js`, line 519. Replace:

```js
      const push = pushes(v, f);
```

with:

```js
      const push = pushes(v, f);
      humidityFirst(v, f, t, push.AH);
```

- [ ] **3.3** `controller.js`, line 530. Replace:

```js
        if (v.CO2 >= R.fanOn && (on || offFor >= R.minOffS)) startPurge(t);
```

with:

```js
        if (v.CO2 >= R.fanOn && !A.delayed && (on || offFor >= R.minOffS)) startPurge(t);
```

- [ ] **3.4** `controller.js`, line 700. Replace:

```js
      if (reason === 'free cooling') return
```

with:

```js
      if (A.delayed) return `Humidity first: RH ${v.RH.toFixed(1)} % is at or below ${(st.rhT - R.rhStop).toFixed(0)} % and outdoor air is drier. The purge waits until RH is ${(st.rhT - R.rhResume).toFixed(0)} % or CO₂ is ${cfg.co2Lim} ppm.`;
      if (reason === 'free cooling') return
```

- [ ] **3.5** `controller.js`, line 932. Replace:

```js
      if (st.air.state === 'purge') return { lvl: 'info', icon: '▲', text: 'Purging' };
```

with:

```js
      if (st.air.delayed) return { lvl: 'info', icon: '❚❚', text: 'Purge delayed (RH)' };
      if (st.air.state === 'purge') return { lvl: 'info', icon: '▲', text: 'Purging' };
```

- [ ] **3.6** `controller.js`, line 863. Replace:

```js
      if (now.fogOn !== p.fogOn)
```

with:

```js
      if (now.delayed && !p.delayed) say(t, 'warning', 'Purge delayed: humidity first');
      else if (!now.delayed && p.delayed && !st.rhLocked) say(t, 'good', 'Purge allowed again: humidity recovered');
      if (now.fogOn !== p.fogOn)
```

- [ ] **Step 4: Run the tests.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 50`, `# fail 0` (controller 41).
- [ ] **Step 5: Commit.**

```bash
git add controller.js tests/controller.test.js
git commit -m "feat(controller): humidity first delays a purge until RH recovers or CO2 reaches the limit (C9 5.6)"
```

## Task 5: Timed purge on a CO₂ sensor fault (C9 5.6, priority 3)

**Files:** Modify `controller.js` (`airPlan`, `airExchange`, `airWhy`, `log`). Test: `tests/controller.test.js`.

| Item | Rule |
|---|---|
| `share` | `historyFor('runS', t, faultSince) / 3600 × 1.1` when `protect.learnSafe` and the history has it, else `timedPurgeOn / timedPurgeEvery`; clamped 0.02–0.9 |
| Run | `min(purgeMaxS, share × timedPurgeEvery × 60)` s |
| Period | `max(run / share, run + minOffS)` s |
| On | While `t mod period < run` |
| Defaults | share 1/3, run 180 s, period 540 s |

- [ ] **Step 1: Write the failing tests.** Apply this edit.

- [ ] **1.1** `tests/controller.test.js`: append at the end of the file (after line 531), after one blank line:

```js
test('a CO2 sensor fault: timed purge from the setting, run capped at purgeMaxS, period with the minimum off time', () => {
  const { feed, ctl, events } = make();
  feed(0, { CO2: 800 });
  feed(30, { CO2: null });
  feed(60, { CO2: null });
  assert.equal(ctl.state.sensors.CO2.fault, false);
  // share 10 / 30 min; run min(180 s, 600 s) = 180 s; period max(180 s / share, 180 s + 60 s) = 540 s: on while t mod 540 < 180
  assert.equal(feed(90, { CO2: null }).air.on, true);
  assert.equal(ctl.state.sensors.CO2.fault, true);
  assert.equal(ctl.state.alarms.sensor_CO2.active, true);
  assert.equal(ctl.state.air.timed, true);
  assert.equal(ctl.state.airReason, 'timed');
  assert.equal(ctl.state.why.air, 'CO₂ sensor fault: timed purge, 180 s of each 540 s (from the setting).');
  assert.ok(events.some(e => e.text === 'CO₂ sensor fault: timed purge started'));
  assert.equal(feed(240, { CO2: null }).air.on, false);
  assert.equal(ctl.state.why.air, 'CO₂ sensor fault: timed purge. The air exchange is in the off part of the cycle.');
  assert.equal(ctl.purges().events.at(-1).reason, 'timed');
  assert.equal(feed(540, { CO2: null }).air.on, true);
  assert.equal(feed(710, { CO2: null }).air.on, true);
  assert.equal(feed(740, { CO2: null }).air.on, false);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'serious', icon: '!', text: 'Sensor fault' });
  feed(770, { CO2: 800 }); feed(800, { CO2: 801 });
  assert.equal(ctl.state.air.timed, false);
  assert.ok(events.some(e => e.text === 'CO₂ sensor back: timed purge ended'));
});

test('a CO2 sensor fault: the timed purge share is learned from the hours before the fault', () => {
  const a = make(); a.feed(0);
  const snap = a.ctl.snapshot();
  snap.purgeRec.hours = [0, 1, 2, 3].map(h => ({ h, runS: 600, starts: 2, m3: 300, cappedN: 0, fogLS: 0, acHighS: 0, acLowS: 0 }));
  const ctl = CC.create(a.cfg, snap, null);
  let seq = 100;
  const feed = (t, o) => ctl.update({ seq: ++seq, t, T: 25 + (seq % 2) * 0.01, RH: 88 + (seq % 2) * 0.1, CO2: 800 + (seq % 2), tOut: 30, rhOut: 70, ...o });
  feed(14400);
  for (const t of [14430, 14460, 14490]) feed(t, { CO2: null });
  assert.equal(ctl.state.air.timed, true);
  // 600 s per hour x 1.1: share 0.1833; run min(180 s, 330 s) = 180 s; period 180 / 0.1833 = 982 s: on from 15 x 982 = 14727 s
  assert.equal(feed(14730, { CO2: null }).air.on, true);
  assert.equal(ctl.state.why.air, 'CO₂ sensor fault: timed purge, 180 s of each 982 s (from this hour of an earlier day).');
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/controller.test.js` → expected `# pass 41`, `# fail 2` (no timed purge yet: on a CO₂ fault `air.on` and `st.air.timed` stay `false`).
- [ ] **Step 3: Implement.** Apply these edits in order.

- [ ] **3.1** `controller.js`, line 508. Replace:

```js
      if (!cfg.manual.air.auto || f.CO2 || st.co2SafetyOn) {
```

with:

```js
      const manual = !cfg.manual.air.auto;
      A.timed = !manual && !!f.CO2;
      if (manual || f.CO2 || st.co2SafetyOn) {
```

- [ ] **3.2** `controller.js`, lines 678–696: replace everything from the line that starts with `// The air exchange request (C9 5.6): manual, then P1 safety, P3 purge, P4 free cooling and drying.` up to, not including, the line that starts with `// Plain-language reason for the air exchange (C9 5.7)`, with:

```js
    // The air exchange request (C9 5.6): manual, then P1 safety, P3 purge or timed purge, P4 free cooling and drying.
    // Returns the reason of the request ('' = off).
    function airExchange(v, f, t) {
      const m = cfg.manual.air, q = st.req.air, R = cfg.rules, P = cfg.protect, A = st.air;
      if (!m.auto) { q.on = !!m.on; st.why.air = 'Manual control. The controller does not change this output.'; return q.on ? 'manual' : ''; }
      // Outdoor drying (hysteresis): RH well above the target and drier outdoor air.
      if (!R.outdoorDry || f.out || f.RH || f.T) st.fanDryOn = false;
      else {
        const ahIn = ahOf(v.T, v.RH), ahOut = ahOf(v.tOut, v.rhOut);
        if (!st.fanDryOn && v.RH > st.rhT + 5 && ahOut < ahIn - 0.5) st.fanDryOn = true;
        else if (st.fanDryOn && (v.RH < st.rhT + 1 || ahOut >= ahIn)) st.fanDryOn = false;
      }
      // Free cooling: the room is warm and outdoor air is at least 3 °C cooler.
      const cool = R.freeCool && !f.out && !f.T && v.T - cfg.spT > 0.3 && v.tOut < v.T - 3;
      // Timed purge (CO2 sensor fault): a share of each period, learned from the hours before the fault or from the setting.
      let timed = null;
      if (A.timed) {
        const learned = P.learnSafe ? historyFor('runS', t, st.sensors.CO2.faultSince) : null;   // s per hour
        const share = clamp(learned != null ? learned / 3600 * 1.1 : P.timedPurgeOn / P.timedPurgeEvery, 0.02, 0.9);
        const run = Math.min(R.purgeMaxS, share * P.timedPurgeEvery * 60), period = Math.max(run / share, run + R.minOffS);
        timed = { on: t % period < run, run, period, learned: learned != null };
      }
      const reason = st.co2SafetyOn ? 'safety' : A.state === 'purge' ? 'purge' : timed && timed.on ? 'timed'
        : cool ? 'free cooling' : st.fanDryOn ? 'drying' : '';
      q.on = reason !== '';
      st.why.air = airWhy(v, reason, timed);
      return reason;
    }
```

- [ ] **3.3** `controller.js`, lines 707–709. Replace:

```js
    function airWhy(v, reason) {
      const R = cfg.rules, A = st.air, t = st.lastT;
      if (reason === 'safety') return `CO₂ is ${ppm(v.CO2)} ppm, at or above the safety level ${R.co2SafetyAt}. The air exchange runs even when humidity is low.`;
```

with:

```js
    function airWhy(v, reason, timed) {
      const R = cfg.rules, A = st.air, t = st.lastT;
      if (reason === 'safety') return `CO₂ is ${ppm(v.CO2)} ppm, at or above the safety level ${R.co2SafetyAt}. The air exchange runs even when humidity is low.`;
      if (timed) return timed.on ? `CO₂ sensor fault: timed purge, ${Math.round(timed.run)} s of each ${Math.round(timed.period)} s (from ${timed.learned ? 'this hour of an earlier day' : 'the setting'}).`
        : 'CO₂ sensor fault: timed purge. The air exchange is in the off part of the cycle.';
```

- [ ] **3.4** `controller.js`, line 878. Replace:

```js
      if (now.fogOn !== p.fogOn)
```

with:

```js
      if (now.timed !== p.timed) say(t, now.timed ? 'serious' : 'good', now.timed ? 'CO₂ sensor fault: timed purge started' : 'CO₂ sensor back: timed purge ended');
      if (now.fogOn !== p.fogOn)
```

- [ ] **Step 4: Run the tests.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 52`, `# fail 0` (controller 43).
- [ ] **Step 5: Commit.**

```bash
git add controller.js tests/controller.test.js
git commit -m "feat(controller): timed purge on a CO2 sensor fault, capped by purgeMaxS (C9 5.6)"
```

## Task 6: The size alarm (C9 5.5)

**Files:** Modify `controller.js` (`CO2_OUT`, `ALARMS`, `raise`, `alarms`, `endPurge`, `sizeCheck`, `airPlan`, `airExchange`). Test: `tests/controller.test.js`.

| Item | Rule |
|---|---|
| On | At the end of the 3rd capped purge in a row (`capRun ≥ 3`), at once (no alarm delay). Recomputed at each later capped purge. |
| Off | A purge that reaches `fanOff` (`capRun = 0`): `clear('airTooSmall')`, `sizeText = null` |
| Estimate | `prodFromRise({ ratePpmS: st.airRate, volume: cfg.roomM3, co2: CO2, co2Out: 420 })`, then `sizeFor({ volume: cfg.roomM3, co2Out: 420, prodM3h, start: fanOn, stop: fanOff, capS: purgeMaxS })` |
| Text (C9 5.5, verbatim) | `Purges don't reach <fanOff> ppm in <cap> min. The air exchange needs about <needM3h> m³/h (now <airM3h> m³/h).` `<cap>` = `purgeMaxS / 60` with at most one decimal; `<needM3h>` a plain integer. No rise rate yet: `… <cap> min. The air exchange is too small; the size needed is not measured yet.` `needM3h = Infinity`: `… <cap> min: outside air alone cannot bring CO₂ this low; raise the stop level.` |
| Shown | At the end of `st.why.air`, and in the alarm event: `Alarm: Air exchange too small for the CO₂ load. <sizeText>` |

The test room is a 60 m³ box with 6000 blocks (0.27 m³/h of CO₂). At 900 m³/h its steady level is 720 ppm, so no purge reaches 700 ppm. `ClimateAir.sizeFor` gives about 1400 m³/h for it.

- [ ] **Step 1: Write the failing tests.** Apply this edit.

- [ ] **1.1** `tests/controller.test.js`: append at the end of the file (after line 572), after one blank line:

```js
const AIR = globalThis.ClimateAir;
// A sealed 60 m³ room: CO2 output prodM3h (m³/h), the air exchange r.airM3h when on, 420 ppm outside.
// step(on, dt) moves r.C with the exact solution of V dC/dt = prod × 10⁶ − Q (C − 420).
function room({ prodM3h = 0.27, airM3h = 900, C = 800 } = {}) {
  const r = {
    C, airM3h,
    step(on, dt) {
      if (!on) { r.C += prodM3h * 1e6 / 60 * dt / 3600; return; }
      const css = 420 + prodM3h * 1e6 / r.airM3h, k = r.airM3h / 60 / 3600;
      r.C = css + (r.C - css) * Math.exp(-k * dt);
    },
  };
  return r;
}

test('3 capped purges in a row raise the size alarm with an estimate; a purge that reaches the stop level clears it', () => {
  assert.ok(CC.ALARMS.some(a => a.id === 'airTooSmall' && a.lvl() === 'warning' && a.label === 'Air exchange too small for the CO₂ load'));
  const { feed, ctl, events, cfg } = make({ rules: { prepare: false } });
  cfg.airM3h = 900;
  const r = room({ airM3h: 900 });                             // 6000 blocks: steady 720 ppm at 900 m³/h, never 700 ppm
  let on = false, t = 0;
  for (; t <= 1800; t += 30) { if (t) r.step(on, 30); on = feed(t, { CO2: r.C }).air.on; }
  const X = ctl.purges();
  assert.ok(X.events.length >= 3, `${X.events.length} purges`);
  for (const e of X.events) assert.deepEqual([e.end - e.start, e.capped, e.reason], [180, true, 'purge']);
  assert.ok(ctl.state.air.capRun >= 3);
  const a = ctl.state.alarms.airTooSmall;
  assert.deepEqual([a.active, a.lvl, a.label], [true, 'warning', 'Air exchange too small for the CO₂ load']);
  const m = /^Purges don't reach 700 ppm in 3 min\. The air exchange needs about (\d+) m³\/h \(now 900 m³\/h\)\.$/.exec(ctl.state.air.sizeText);
  assert.ok(m, ctl.state.air.sizeText);
  const truth = AIR.sizeFor({ volume: 60, co2Out: 420, prodM3h: 0.27, start: 900, stop: 700, capS: 180 }).needM3h;
  assert.ok(Math.abs(Number(m[1]) - truth) / truth <= 0.15, `estimate ${m[1]}, truth ${truth}`);
  assert.ok(ctl.state.why.air.endsWith(` ${ctl.state.air.sizeText}`));
  assert.ok(events.some(e => e.lvl === 'warning' && e.text === `Alarm: Air exchange too small for the CO₂ load. ${ctl.state.air.sizeText}`));
  // A bigger air exchange: the next purge reaches the stop level and the alarm clears.
  cfg.airM3h = 1800; r.airM3h = 1800;
  for (const end = t + 900; t <= end; t += 30) { r.step(on, 30); on = feed(t, { CO2: r.C }).air.on; }
  assert.equal(ctl.state.air.capRun, 0);
  assert.equal(ctl.state.alarms.airTooSmall.active, false);
  assert.equal(ctl.state.air.sizeText, null);
  assert.equal(ctl.purges().events.at(-1).capped, false);
});

test('the size alarm before a rise rate is measured says so', () => {
  const { feed, ctl } = make({ rules: { prepare: false } });
  let t = 0;
  for (let n = 0; n < 3; n++) {                                // CO2 jumps above the start level: no rise rate with the fans off
    for (const end = t + 180; t <= end; t += 30) feed(t, { CO2: 950 + (t % 60 ? 1 : 0) });
    for (const end = t + 30; t <= end; t += 30) feed(t, { CO2: 950 + (t % 60 ? 1 : 0) });
  }
  assert.equal(ctl.state.air.capRun, 3);
  assert.equal(ctl.state.air.sizeText, "Purges don't reach 700 ppm in 3 min. The air exchange is too small; the size needed is not measured yet.");
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/controller.test.js` → expected `# pass 43`, `# fail 2` (no `airTooSmall` entry in `ALARMS`; `sizeText` is `null`).
- [ ] **Step 3: Implement.** Apply these edits in order.

- [ ] **3.1** `controller.js`, line 118. Replace:

```js
  const AIR_POINTS = 20;           // CO2 readings kept for the rise rate
```

with:

```js
  const AIR_POINTS = 20;           // CO2 readings kept for the rise rate
  const CO2_OUT = 420;             // ppm; outdoor CO2 for the size estimate
```

- [ ] **3.2** `controller.js`, line 205. Replace:

```js
    { id: 'disagree',
```

with:

```js
    // Raised and cleared by the purge cycle (endPurge), not by the loop in alarms(): 3 capped purges in a row.
    { id: 'airTooSmall', label: 'Air exchange too small for the CO₂ load', lvl: () => 'warning' },
    { id: 'disagree',
```

- [ ] **3.3** `controller.js`, lines 411–415. Replace:

```js
    function raise(id, label, lvl, t) {
      const a = st.alarms[id];
      if (a && a.active) return;
      st.alarms[id] = { id, label, lvl, active: true, acked: false, since: t };
      say(t, lvl, `Alarm: ${label}`);
```

with:

```js
    function raise(id, label, lvl, t, note) {
      const a = st.alarms[id];
      if (a && a.active) return;
      st.alarms[id] = { id, label, lvl, active: true, acked: false, since: t };
      say(t, lvl, `Alarm: ${label}${note ? `. ${note}` : ''}`);
```

- [ ] **3.4** `controller.js`, lines 426–427. Replace:

```js
      for (const a of ALARMS) {
        if (a.uses && f[a.uses])
```

with:

```js
      for (const a of ALARMS) {
        if (!a.on) continue;                                                  // raised elsewhere (airTooSmall)
        if (a.uses && f[a.uses])
```

- [ ] **3.5** `controller.js`, lines 486–488. Replace:

```js
        say(t, 'info', `Purge stopped at the time cap (${mss(runS)})`);
      } else if (capped === false) A.capRun = 0;
    }
```

with:

```js
        say(t, 'info', `Purge stopped at the time cap (${mss(runS)})`);
        if (A.capRun >= 3) sizeCheck(t);
      } else if (capped === false) {
        A.capRun = 0;
        A.sizeText = null;
        clear('airTooSmall', null, t);
      }
    }
    // 5.5: after 3 capped purges in a row, the size the room needs, from the last rise rate with the fans off.
    function sizeCheck(t) {
      const R = cfg.rules, A = st.air, AIR = global.ClimateAir;
      const head = `Purges don't reach ${R.fanOff} ppm in ${+(R.purgeMaxS / 60).toFixed(1)} min`;
      if (st.airRate > 0) {
        const prod = AIR.prodFromRise({ ratePpmS: st.airRate, volume: cfg.roomM3, co2: st.v.CO2, co2Out: CO2_OUT });
        const need = AIR.sizeFor({ volume: cfg.roomM3, co2Out: CO2_OUT, prodM3h: prod, start: R.fanOn, stop: R.fanOff, capS: R.purgeMaxS });
        A.sizeText = Number.isFinite(need.needM3h)
          ? `${head}. The air exchange needs about ${need.needM3h} m³/h (now ${cfg.airM3h} m³/h).`
          : `${head}: outside air alone cannot bring CO₂ this low; raise the stop level.`;
      } else A.sizeText = `${head}. The air exchange is too small; the size needed is not measured yet.`;
      raise('airTooSmall', ALARMS.find(a => a.id === 'airTooSmall').label, 'warning', t, A.sizeText);
    }
```

- [ ] **3.6** `controller.js`, line 527. Replace:

```js
      const rate = AIR.riseRate(st.airPts);
```

with:

```js
      const rate = AIR.riseRate(st.airPts);
      if (rate != null) st.airRate = rate;                                   // kept for the size estimate (5.5)
```

- [ ] **3.7** `controller.js`, line 726. Replace:

```js
      st.why.air = airWhy(v, reason, timed);
```

with:

```js
      st.why.air = airWhy(v, reason, timed) + (A.sizeText ? ` ${A.sizeText}` : '');
```

- [ ] **Step 4: Run the tests.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 54`, `# fail 0` (controller 45).
- [ ] **Step 5: Commit.**

```bash
git add controller.js tests/controller.test.js
git commit -m "feat(controller): airTooSmall alarm with the size estimate after 3 capped purges (C9 5.5)"
```

## Task 7: Old snapshot upgrade (C9 5.7)

**Files:** Modify `controller.js` (`OLD_STATE`, `upgradeState`, the first line of `create`). Test: `tests/controller.test.js`.

Live rooms save `ctl.snapshot()` (`server/rooms.js` lines 217 and 312) and pass it back to `create`. After the merge they hold the old fields once.

| Old | New |
|---|---|
| `fanCo2On`, `co2Timed`, `purgeHeld`, `purgeReduced`, `setbackReq`, `setbackOn`, `setbackS`, `setbackAlarmStop`, `setbackTimeStop`, `fanReason`, `fanBlocked`, `airLevel`, `airStepT`, `timedOnS`, `timedSource` | Deleted |
| `cmd.fan`, `req.fan` | `cmd.air` = `req.air` = `{ on: cmd.fan.level > 0 }` |
| `out.fan`, `hold.fan`, `why.fan` | `out.air`, `hold.air`, `why.air` |
| — | `air` = `airInit()`; `airReason` = `null`; `airPts` = `[]`; `airRate` = `null`; `airRunCapped` = `false` |
| `exh` | `purgeRec = { cur: null, events: [], hours }`, each hour kept with `cappedN: 0` |
| `stats` | `airOnS` = `fanOnS`, `purges` = `fanStarts`, `fogStarts` and `acCmds` kept, the rest 0 |
| `prev` | `null` (the log starts again, so no false events) |

- [ ] **Step 1: Write the failing test.** Apply this edit.

- [ ] **1.1** `tests/controller.test.js`: append at the end of the file (after line 626), after one blank line:

```js
test('an old snapshot (one fan with levels) is upgraded by create()', () => {
  const { ctl, feed } = make(); feed(0); feed(30);
  const s = ctl.snapshot();                                     // made old by hand: the fields a version 1 controller saved
  delete s.air; delete s.airReason; delete s.airPts; delete s.airRate; delete s.purgeRec;
  Object.assign(s, { fanCo2On: true, co2Timed: false, purgeHeld: false, purgeReduced: false, setbackReq: true, setbackOn: true, setbackS: 120,
    setbackAlarmStop: false, setbackTimeStop: false, fanReason: 'CO₂ purge', fanBlocked: false, airLevel: 2, airStepT: 0, timedOnS: 300, timedSource: 'setting' });
  for (const g of ['cmd', 'req']) { delete s[g].air; s[g].fan = { level: 2 }; }
  s.out.fan = { since: 0 }; delete s.out.air;
  s.hold.fan = ''; delete s.hold.air;
  s.why.fan = 'CO₂ is 950 ppm. Purge at Medium.'; delete s.why.air;
  s.stats = { fanOnS: 3600, fanStarts: 12, fogStarts: 3, setbackS: 600, acOffS: 0, fanBlockedS: 0, acCmds: 7 };
  s.exh = { cur: { start: 0, end: null, maxLevel: 2, reason: 'CO₂ purge', co2Start: 950, co2End: null, m3: 5 },
    events: [{ start: -600, end: -300, maxLevel: 2, reason: 'CO₂ purge', co2Start: 950, co2End: 700, m3: 50 }],
    hours: [{ h: 0, runS: 300, starts: 1, m3: 50, fogLS: 30, acHighS: 0, acLowS: 0 }] };
  s.prev = { power: true, mode: 'cool', setback: true, fanOn: true, fanReason: 'CO₂ purge', fogOn: false, lights: true, blocked: false, reduced: false, safety: false, timed: false };
  const events = [];
  const up = CC.create(CC.defaultSettings(), s, e => events.push(e));
  const st = up.state;
  for (const k of ['fanCo2On', 'co2Timed', 'purgeHeld', 'purgeReduced', 'setbackReq', 'setbackOn', 'setbackS', 'setbackAlarmStop', 'setbackTimeStop',
    'fanReason', 'fanBlocked', 'airLevel', 'airStepT', 'timedOnS', 'timedSource', 'exh']) assert.equal(k in st, false, k);
  assert.deepEqual([st.cmd.air, st.req.air, 'fan' in st.cmd, 'fan' in st.req], [{ on: true }, { on: true }, false, false]);
  assert.deepEqual(st.air, { state: 'idle', since: null, purgeStart: null, capRun: 0, prepT: 0, prepRH: 0, nextPurgeS: null, delayed: false, timed: false, sizeText: null });
  assert.deepEqual([st.out.air, st.hold.air, st.why.air, 'fan' in st.out, 'fan' in st.hold, 'fan' in st.why], [{ since: 0 }, '', 'CO₂ is 950 ppm. Purge at Medium.', false, false, false]);
  assert.deepEqual(up.purges(), { cur: null, events: [], hours: [{ h: 0, runS: 300, starts: 1, m3: 50, cappedN: 0, fogLS: 30, acHighS: 0, acLowS: 0 }] });
  assert.deepEqual(st.stats, { airOnS: 3600, purges: 12, purgeS: 0, longestPurgeS: 0, cappedPurges: 0, delayedS: 0, fogStarts: 3, acCmds: 7 });
  assert.equal(st.prev, null);
  const cmd = up.update({ seq: 99, t: 60, T: 25, RH: 88, CO2: 800, tOut: 30, rhOut: 70 });
  assert.equal(cmd.air.on, false, 'the next step runs on the new model');
  assert.deepEqual(events.filter(e => /Air exchange/.test(e.text)), [], 'no event from the old log state');
  const again = CC.create(CC.defaultSettings(), up.snapshot(), null);
  assert.deepEqual(again.state, up.state, 'a version 2 snapshot is not changed');
});
```

- [ ] **Step 2: Run it to see it fail.** `node --test tests/controller.test.js` → expected `# pass 45`, `# fail 1` (`fanCo2On` is still in the state).
- [ ] **Step 3: Implement.** Apply this edit.

- [ ] **3.1** `controller.js`, lines 237–240. Replace:

```js

  function create(cfg, snapshot, onEvent) {
    const emit = onEvent || (() => {});
    let st = snapshot ? structuredClone(snapshot) : freshState(cfg);
```

with:

```js
  // A snapshot saved before C9 (one fan with levels 0-3): bring it to the air exchange shape (C9 5.7).
  const OLD_STATE = ['fanCo2On', 'co2Timed', 'purgeHeld', 'purgeReduced', 'setbackReq', 'setbackOn', 'setbackS', 'setbackAlarmStop',
    'setbackTimeStop', 'fanReason', 'fanBlocked', 'airLevel', 'airStepT', 'timedOnS', 'timedSource'];
  function upgradeState(s) {
    if (s.air) return s;
    const on = !!(s.cmd.fan && s.cmd.fan.level > 0);
    for (const k of OLD_STATE) delete s[k];
    for (const g of ['cmd', 'req']) { s[g].air = { on }; delete s[g].fan; }
    s.out.air = s.out.fan || { since: null }; delete s.out.fan;
    for (const g of ['hold', 'why']) { s[g].air = s[g].fan || ''; delete s[g].fan; }
    s.air = airInit(); s.airReason = null; s.airPts = []; s.airRate = null; s.airRunCapped = false; s.airPrepared = false;
    const hours = (s.exh && s.exh.hours) || [];
    s.purgeRec = { cur: null, events: [], hours: hours.map(b => ({ h: b.h, runS: b.runS || 0, starts: b.starts || 0, m3: b.m3 || 0, cappedN: 0, fogLS: b.fogLS || 0, acHighS: b.acHighS || 0, acLowS: b.acLowS || 0 })) };
    delete s.exh;
    const S = s.stats || {};
    s.stats = { airOnS: S.fanOnS || 0, purges: S.fanStarts || 0, purgeS: 0, longestPurgeS: 0, cappedPurges: 0, delayedS: 0, fogStarts: S.fogStarts || 0, acCmds: S.acCmds || 0 };
    s.prev = null;                       // the event log compares with the step before: start it again
    return s;
  }

  function create(cfg, snapshot, onEvent) {
    const emit = onEvent || (() => {});
    let st = snapshot ? upgradeState(structuredClone(snapshot)) : freshState(cfg);
```

- [ ] **Step 4: Run the tests.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 55`, `# fail 0` (controller 46, settings 9).
- [ ] **Step 5: Commit.**

```bash
git add controller.js tests/controller.test.js
git commit -m "feat(controller): create() upgrades an old controller snapshot (C9 5.7)"
```

## Task 8: Sensor check: a purge's CO₂ fall is not a spike (C9 5.6)

**Files:** Modify `controller.js` (`validate`, `update`). Test: `tests/controller.test.js`.

A strong purge lowers CO₂ faster than the rate limit of the CO₂ sensor (1000 ppm/min). Without this task the spike filter rejects real readings during a purge, and 3 in a row give a false `sensor_CO2` fault.

| Item | Rule |
|---|---|
| Not tested | A falling `CO2` or `CO2b` reading while the fans ran in the last interval (`prevOn`), or at the one reading after they stopped (`st.out.air.since` is the time of the last reading) |
| Tested as today | A rising reading, always; a falling reading once the fans were off for a whole interval |
| Other sensors | Unchanged |

- [ ] **Step 1: Write the failing test.** Apply this edit.

- [ ] **1.1** `tests/controller.test.js`: append at the end of the file (after line 659), after one blank line:

```js
test('sensor check: a falling CO2 is no spike while the fans run and for one reading after; a rise still is', () => {
  const { feed, ctl } = make({ rules: { prepare: false, co2Safety: false, purgeMaxS: 60 } });
  feed(0, { CO2: 3000 });                                       // purge
  feed(30, { CO2: 2400 });                                      // -1200 ppm/min with the fans on
  assert.deepEqual([ctl.state.v.CO2, ctl.state.sensors.CO2.why], [2400, '']);
  assert.equal(feed(60, { CO2: 1800 }).air.on, false, 'the cap: off at 60 s');
  assert.equal(ctl.state.v.CO2, 1800);
  feed(90, { CO2: 1200 });                                      // the one reading after the fans stopped
  assert.equal(ctl.state.v.CO2, 1200);
  feed(120, { CO2: 600 });                                      // the fans were off for a whole interval: tested again
  assert.deepEqual([ctl.state.v.CO2, ctl.state.sensors.CO2.why], [1200, 'sudden jump (spike)']);
  const b = make({ rules: { prepare: false, co2Safety: false } });
  b.feed(0, { CO2: 1000 });
  assert.equal(b.ctl.state.cmd.air.on, true);
  b.feed(30, { CO2: 1700 });                                    // +1400 ppm/min with the fans on: a rise is still tested
  assert.deepEqual([b.ctl.state.v.CO2, b.ctl.state.sensors.CO2.why], [1000, 'sudden jump (spike)']);
});
```

- [ ] **Step 2: Run it to see it fail.** `node --test tests/controller.test.js` → expected `# pass 46`, `# fail 1` (`v.CO2` stays 3000: the fall is taken as a spike).
- [ ] **Step 3: Implement.** Apply these edits in order.

- [ ] **3.1** `controller.js`, line 364. Replace:

```js
    function validate(r) {
```

with:

```js
    // co2FallFree (C9 5.6): the air exchange ran in the last interval or stopped at the last reading, so CO2 may fall fast.
    function validate(r, co2FallFree) {
```

- [ ] **3.2** `controller.js`, line 379. Replace:

```js
          if (perMin > L.rate) {
```

with:

```js
          // A purge really lowers CO2 faster than the rate limit (C9 5.6): a falling CO2 is not tested then.
          const purgeFall = co2FallFree && (k === 'CO2' || k === 'CO2b') && x < s.good;
          if (perMin > L.rate && !purgeFall) {
```

- [ ] **3.3** `controller.js`, line 937. Replace:

```js
      const prevOn = st.cmd.air.on, prevFog = st.cmd.hu.level, wasSafe = st.co2SafetyOn;
```

with:

```js
      const prevOn = st.cmd.air.on, prevFog = st.cmd.hu.level, wasSafe = st.co2SafetyOn;
      const co2FallFree = prevOn || (st.out.air.since != null && st.out.air.since === st.lastT);   // before st.lastT moves
```

- [ ] **3.4** `controller.js`, line 948. Replace:

```js
      const { v, f } = validate(r);
```

with:

```js
      const { v, f } = validate(r, co2FallFree);
```

- [ ] **Step 4: Run the tests.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 56`, `# fail 0` (controller 47).
- [ ] **Step 5: Commit.**

```bash
git add controller.js tests/controller.test.js
git commit -m "fix(controller): the CO2 spike filter lets a purge's fall through (C9 5.6 sensor check)"
```

## Task 9: Header comment and the `noFogBoost` flag (C9 5.1, 5.2)

**Files:** Modify `controller.js` (lines 11–28 and 46 at `<base>`), `tests/controller.test.js` (the `flagTest` crop).

No new test: the edits change comments and a test crop.

- [ ] **Step 1: Apply these edits in order.**

- [ ] **1.1** `controller.js`, line 11. Replace:

```js
 *   commands { ac: { power, mode, setpoint }, hu: { level }, fan: { level } }
```

with:

```js
 *   commands { ac: { power, mode, setpoint, fan }, hu: { level }, air: { on }, lights: { on }, circ: { on } }
```

- [ ] **1.2** `controller.js`, lines 13–28: replace everything from the line that starts with `* The air conditioner is a split unit with its own thermostat` up to, not including, the line that starts with `*/`, with:

```js
 * The air conditioner is a split unit with its own thermostat: the controller sends a mode and a
 * setpoint. The fogger has fixed power levels. The air exchange is a filtered intake fan (SF-203) and an
 * exhaust fan (EF-206), each with a motorised damper, switched on and off together (contract C9).
 *
 * Each update has these steps:
 *   0. Stage program: slow change of the targets after a stage change (ramp), automatic stage change
 *      after the set days, flush count, and the daily harvest windows (fogger off before picking).
 *   1. Check each sensor value. A bad value is not used; 3 bad readings = sensor fault.
 *   2. Purge cycle: idle -> prepare -> purge -> after -> idle. The CO2 rise with the fans off predicts the
 *      next purge. When purges are far apart (gap >= 2 x prepareLeadS), in prepare and the purge after it the
 *      AC and the fogger aim halfway to the side of their bands away from the purge's push. A purge runs from the start level (fanOn) to the stop level (fanOff), at most purgeMaxS.
 *      3 capped purges in a row: the "air exchange too small" alarm, with the size the room needs.
 *   3. Rules for the air exchange, highest priority first:
 *        Manual  the grower's on/off.
 *        P1  CO2 safety level: on, ignoring the time cap and the minimum off time.
 *        P2  Humidity first:   a purge that would dry the room waits while RH is low, at most until the CO2 limit.
 *        P3  CO2 purge, or a timed purge when the CO2 sensor fails.
 *        P4  Free cooling and outdoor drying.
 *      Then the temperature and humidity loops. A failed sensor puts its loop in a safe state.
 *   4. Machine protection: the air exchange runs at least 30 s and stays off rules.minOffS; minimum on/off
 *      times for the fogger; a minimum time between AC commands.
 *   5. Purge record: each air run (start, end, reason, CO2, air volume, capped) and a total per hour.
```

- [ ] **1.3** `controller.js`, line 52. Replace:

```js
maxFog (no direct fog on the crop), noFogBoost, shock
```

with:

```js
maxFog (no direct fog on the crop), shock
```

- [ ] **1.4** `tests/controller.test.js`, line 187. Replace:

```js
// No crop in the list uses the flags maxFog, noFogBoost, shock and spawnLights now
```

with:

```js
// No crop in the list uses the flags maxFog, shock and spawnLights now
```

- [ ] **1.5** `tests/controller.test.js`, line 188. Replace:

```js
maxFog: 2, noFogBoost: true, shock:
```

with:

```js
maxFog: 2, shock:
```

- [ ] **Step 2: Run the tests.** `node --test tests/controller.test.js tests/settings.test.js` → expected `# pass 56`, `# fail 0`.
- [ ] **Step 3: Check for leftovers.**

```bash
grep -nE "fanCo2On|purgeHeld|purgeReduced|setback|airLevel|AIR_STEP_S|fogBoost|noFogBoost|fanM3h|fanLevels|st\.exh|exhaust\(|fanReason|fanBlocked|co2Timed|cmd\.fan|req\.fan|acPurge|acAction|maxSetback|timedOnS|timedSource|rhAction|airMode|baseFan" controller.js
```

Expected: 5 lines, all intended: the 2 lines of `OLD_STATE`, the `const on = …` line of `upgradeState`, and the 2 lines of `REMOVED_SETTINGS`.

- [ ] **Step 4: Commit.**

```bash
git add controller.js tests/controller.test.js
git commit -m "docs(controller): header comment for the purge cycle; drop the noFogBoost flag (C9 5.1, 5.2)"
```

## Task 10: Vectors pack and scenarios (C9 9)

**Files:** Modify `tests/vectors.test.js` (lines 6 and 9 at `<base>`), `tools/make-vectors.js` (lines 6, 11–12, 34, 46–47 at `<base>`).

Do **not** run `npm run vectors` or `node tools/make-vectors.js`: at `<base>`, `sim.js` still reads `cmd.fan.level` and would crash, and `tests/vectors/*.json` belong to the lead (C9 2, 9). `tests/vectors.test.js` fails until the lead regenerates the files (section 4.5).

- [ ] **Step 1: Apply these edits in order.**

- [ ] **1.1** `tests/vectors.test.js`, line 6. Replace:

```js
require('../controller.js');
```

with:

```js
require('../air.js');
require('../controller.js');
```

- [ ] **1.2** `tests/vectors.test.js`, line 10. Replace:

```js
const pack = c => [c.ac.power ? 1 : 0, c.ac.mode, c.ac.setpoint, c.ac.fan, c.hu.level, c.fan.level, c.lights.on ? 1 : 0, c.circ.on ? 1 : 0];
```

with:

```js
const pack = c => [c.ac.power ? 1 : 0, c.ac.mode, c.ac.setpoint, c.ac.fan, c.hu.level, c.air.on ? 1 : 0, c.lights.on ? 1 : 0, c.circ.on ? 1 : 0];
```

- [ ] **1.3** `tools/make-vectors.js`, line 6. Replace:

```js
require(path.join(D, 'sim.js')); require(path.join(D, 'controller.js'));
```

with:

```js
require(path.join(D, 'air.js')); require(path.join(D, 'sim.js')); require(path.join(D, 'controller.js'));
```

- [ ] **1.4** `tools/make-vectors.js`, lines 11–12. Replace:

```js
// Compact command: [acPower, acMode, acSetpoint, acFan, fogLevel, fanLevel, lights, circ]
const packCmd = c => [c.ac.power ? 1 : 0, c.ac.mode, c.ac.setpoint, c.ac.fan, c.hu.level, c.fan.level, c.lights.on ? 1 : 0, c.circ.on ? 1 : 0];
```

with:

```js
// Compact command: [acPower, acMode, acSetpoint, acFan, fogLevel, air, lights, circ]
const packCmd = c => [c.ac.power ? 1 : 0, c.ac.mode, c.ac.setpoint, c.ac.fan, c.hu.level, c.air.on ? 1 : 0, c.lights.on ? 1 : 0, c.circ.on ? 1 : 0];
```

- [ ] **1.5** `tools/make-vectors.js`, line 34. Replace:

```js
cmdFields: ['acPower', 'acMode', 'acSetpoint', 'acFan', 'fogLevel', 'fanLevel', 'lights', 'circ']
```

with:

```js
cmdFields: ['acPower', 'acMode', 'acSetpoint', 'acFan', 'fogLevel', 'air', 'lights', 'circ']
```

- [ ] **1.6** `tools/make-vectors.js`, lines 46–47. Replace:

```js
record('crowded-dry', 'Dry air and 6000 blocks for 12 h, humidity action "reduce to Low", fan level High: reduced purges and the CO2 safety level.',
  { hours: 12, env: { nightRH: 50, blocks: 6000 }, cfg: { rules: { ...CC.defaultRules(1000), rhAction: 'low', fanLevel: 3 } } });
```

with:

```js
record('crowded-dry', 'Dry air and 6000 blocks for 12 h: purges delayed by humidity first, and the CO2 safety level.',
  { hours: 12, env: { nightRH: 50, blocks: 6000 }, cfg: { rules: CC.defaultRules(1000) } });
record('capped-purges', 'Grey oyster fruiting, 6000 blocks, an air exchange of 900 m³/h: the purges hit the time cap and the size alarm comes.',
  { hours: 6, env: { blocks: 6000, airM3h: 900 }, cfg: { airM3h: 900 } });
```

- [ ] **Step 2: Check the syntax.** `node --check tools/make-vectors.js && node --check tests/vectors.test.js` → no output, exit code 0.
- [ ] **Step 3: Check the failure is the expected one.** `node --test tests/vectors.test.js` → expected `# fail 8`, each with `Cannot read properties of undefined (reading 'auto')` (the recorded settings have no `manual.air`).
- [ ] **Step 4: Commit.**

```bash
git add tests/vectors.test.js tools/make-vectors.js
git commit -m "test(vectors): pack air.on, cmdFields, crowded-dry and capped-purges scenarios (C9 9)"
```

## Task 11: Whole check and hand-off

**Files:** none.

- [ ] **Step 1: Run the stream's tests.** `node --test tests/controller.test.js tests/settings.test.js tests/air.test.js` → expected `# pass 65`, `# fail 0`.
- [ ] **Step 2: Run the whole suite.** `npm test`. Then list the failing files:

```bash
for f in tests/*.test.js; do n=$(node --disable-warning=ExperimentalWarning --test "$f" 2>&1 | awk '/^# fail/ {print $3}'); [ "$n" != "0" ] && echo "$f $n"; done
```

Expected: exactly the 9 files of section 4.5. The counts may differ by a few from the table; the file list must match. A failing file outside the table means a bug in this stream: fix it, or stop and report.

- [ ] **Step 3: Check the history.** `git log --oneline <base>..HEAD` → 10 commits (tasks 1–10). `git status --short` → nothing.
- [ ] **Step 4: Report to the lead.** One table: the commits, the test counts (controller 47, settings 9), the failing files of step 2 with their counts, and anything that did not match this brief or C9.

## Done checklist

| Check | How |
|---|---|
| `controller.test.js` 47 pass, `settings.test.js` 9 pass | Task 11 step 1 |
| `update()` returns `air: { on }`; no `fan` key in `cmd`, `req`, `manual`, `out`, `hold`, `why` | Task 2 tests, task 9 grep |
| Settings version 2 with the C9 5.2 keys, ranges, removed keys, `RAMP_KEYS` | `settings.test.js` |
| `upgradeSettings` pure, idempotent; `importSettings` upgrades version < 2 first | Task 1, task 2 tests |
| States `idle` / `prepare` / `purge` / `after`, 30 s minimum on, `minOffS`, cap, `capRun` | Tasks 2, 3 tests |
| Prepare in four directions, small push, no outdoor reading, AC and fogger targets, the gap rule | Task 3 tests |
| Humidity first, safety, timed purge, free cooling, drying | Tasks 2, 4, 5 tests |
| `airTooSmall` with the estimate within 15 % of `sizeFor`; clears | Task 6 tests |
| `purges()`, `st.stats`, `status('CO2')`, `why.air`, events | Tasks 2–6 tests |
| Old snapshot upgrade | Task 7 test |
| No old names left | Task 9 grep |
| The CO₂ spike filter lets a purge's fall through; a rise is still tested | Task 8 test |
| Vectors pack, `cmdFields`, `crowded-dry`, `capped-purges`; not run | Task 10 |
| Only owned files changed | `git diff --stat <base>..HEAD` lists only the 5 files of section 2 |

## Contract questions for the lead

All answered by the lead (C9 commits 1ac170c, 2fd0e57, 1c9b9b9). The brief follows the rulings below; none is open.

| C9 section | Question | Ruling (now in C9) | Where in this brief |
|---|---|---|---|
| 3 | Other streams' files must require `air.js` | C9 3 names every module that runs a controller loop; the lead checks at integration | Section 4.5; this stream's own files in tasks 1, 2, 10 |
| 5.2 | `manual.fan` that is not an object | Dropped with the warning; the default `manual.air` is filled in later | Task 1 |
| 5.3 | States under manual control or a CO₂ fault | `idle`, offsets 0; a running purge ends without counting as capped | Task 2 (`airPlan`) |
| 5.3 | A long safety run | A safety run is not a purge: never counts in `capRun`, `purges`, `cappedPurges` or `longestPurgeS` | Task 2: during a safety run the state is `idle`; a running purge ends there, not capped |
| 5.3 | The current reason for the web status card | `ctl.state.airReason`, `null` when off, follows the run; `purges().cur.reason` keeps the start reason | Task 2 (`update` after `protectAir`) |
| 5.4 | Room T or RH fault; `rules.prepare` off; fogger scope | `prepT` 0 with a T fault, `prepRH` 0 with a T or RH fault; no offsets with `prepare` off; the whole fogger rule (also the harvest floor) uses `rhT + prepRH` | Task 3 |
| 5.5 | No rise rate, `Infinity`, number formats | The last rise rate that is not `null`; two extra texts; plain integer; minutes with at most one decimal | Task 6, texts verbatim |
| 5.6 | When "delayed", and when "allowed again" | `delayed` only while `fanOn ≤ CO₂ < co2Lim`; "allowed again" only when RH recovers | Task 4 |
| 5.7 | Snapshot `exh.cur`, `prev`, new fields | `cur` dropped, `prev` null, new fields initial | Task 7 |
| 5.7 | `status('CO2')` in the first 60 s of a safety run, before the `co2Safe` alarm, showed `Below limit` | After `co2Hi`: `airReason === 'safety'` → `Safety run` (C9 1c9b9b9) | Task 2 (`status`, safety test) |
| 9 | `capped-purges` size | `cfg: { airM3h: 900 }` with `env.airM3h: 900` | Task 10 |
| 5.3, 5.4 (owner decision, C9 2fd0e57) | Prototype: RH in band 94.7 % (Prepare off) → 85.4 % (on) at 6000 blocks | Prepare only when `gapS ≥ 2 × prepareLeadS`; offsets 0.5 × the band | Task 3 (gap rule, ±0.5 °C, ±1.5 %) |

Two notes for the lead:

| Note | Detail |
|---|---|
| Offsets in a purge without Prepare | C9 5.4 says the offsets act "in `prepare` and `purge`" and that Prepare acts only when `gapS ≥ 2 × prepareLeadS`. During a purge `gapS` cannot be measured (no readings with the fans off). The brief keeps the offsets in a purge only when it followed a `prepare` (`st.airPrepared`); a purge from `idle` moves no target. Confirm. |
| Prototype with the new rule | Same stand-in as before (not the simulation stream's code: `cmd.air.on` drives today's supply fan at `env.airM3h` = 1800 m³/h), oyster fruiting, no harvest window, 24 h measured after 6 h. Shown in the table below. |

| Blocks | Prepare | In T band | In RH band | Purges per day | States (readings: idle / prepare / purge / after) |
|---|---|---|---|---|---|
| 6000 | on | 58.0 % | 94.7 % | 279 | 983 / 0 / 758 / 420 |
| 6000 | off | 58.0 % | 94.7 % | 279 | 983 / – / 758 / 420 |
| 2000 | on | 99.2 % | 93.8 % | 111 | 1217 / 529 / 249 / 166 |
| 2000 | off | 100 % | 100 % | 111 | 1750 / – / 247 / 164 |

At 6000 blocks the gap rule keeps Prepare off (purges about 5 min apart), so on and off are equal. At 2000 blocks Prepare acts (purges about 13 min apart) and still lowers the time in band: the room is in band without it, and the offsets move the targets towards the band edge for about a quarter of the day. The lead's "Prepare on vs off" integration test (README task 2.3) would fail at 6000 blocks (equal, not better) and at 2000 blocks (worse) in this stand-in.

## Self-review

### Every C9 requirement of this stream, mapped to a task

| C9 | Requirement | Task |
|---|---|---|
| 3 | `global.ClimateAir` read at call time; tests and `tools/make-vectors.js` require `air.js` first | 3, 6 (code); 1, 2, 10 (requires) |
| 5.1 | `st.cmd` / `st.req` `air: { on: false }` | 2 |
| 5.1 | `cfg.manual.air = { auto: true, on: false }` | 2 |
| 5.1 | Device key `air` in `st.why`, `st.hold`, `st.out` | 2 |
| 5.1 | Header comment rewritten | 9 |
| 5.1 | `MACHINES`: no `fanLevels`, `fanM3h`; `airTags` | 2 |
| 5.2 | `airM3h` 50–10000, default 1800 | 2 |
| 5.2 | `fanOn`, `fanOff` kept; correction `fanOff ≤ fanOn − 50` | 2 |
| 5.2 | `purgeMaxS`, `prepare`, `prepareLeadS`, `minOffS` with ranges and defaults | 2 |
| 5.2 | `rhLock`, `rhStop`, `rhResume`, `freeCool`, `outdoorDry`, `co2Safety`, `co2SafetyAt`, `timedPurgeOn`, `timedPurgeEvery`, `learnSafe` kept | 2 |
| 5.2 | The 15 removed keys | 2 (defaults, limits, enums), 1 (upgrade) |
| 5.2 | `SETTINGS_VERSION` 2 | 2 |
| 5.2 | `RAMP_KEYS`; `profileTargets`, `applyProfile` follow | 2 |
| 5.2 | `SETTING_LIMITS`, `SETTING_ENUMS` | 2 |
| 5.2 | `upgradeSettings(obj)`: pure, warnings, `manual.fan` → `manual.air`, idempotent | 1 |
| 5.2 | `importSettings`: version < 2 or missing → `upgradeSettings` first, its warnings first | 2 |
| 5.2 | `noFogBoost` removed, also from `flagTest` | 2 (code), 9 (comment, test crop) |
| 5.3 | `st.air` shape and initial value | 2 |
| 5.3 | `idle`, `purge`, `after` transitions | 2 |
| 5.3 | `prepare` transitions | 3 |
| 5.3 | 30 s minimum on; manual Off and safety exit at once | 2 |
| 5.3 | `minOffS` after every air run; safety ignores it | 2 |
| 5.3 | `capRun` | 2 |
| 5.3 | Manual control, CO₂ fault: `idle`, a running purge not capped | 2 |
| 5.3 | Safety runs are not purges (no `capRun`, `purges`, `cappedPurges`, `longestPurgeS`) | 2 |
| 5.3 | `ctl.state.airReason`, `null` when off, follows the run | 2 |
| 5.3 | Purge seconds in whole steps | 2 |
| 5.4 | Points, at most 20; `riseRate` | 3 |
| 5.4 | `gapS` and the rule `gapS ≥ 2 × prepareLeadS`; offsets 0.5 × the band | 3 |
| 5.4 | `nextPurgeS` | 3 |
| 5.4 | `pushT`, `pushAH`, `prepT`, `prepRH`, outdoor fault, room sensor fault, `prepare` off, fogger scope | 3 |
| 5.4 | AC uses `spT + prepT`, fogger `rhT + prepRH`; alarms and display stay on `spT`, `rhT`; 0 in `idle`, `after` | 3 |
| 5.4 | No AC setback | 2 |
| 5.5 | `ALARMS` entry, on at `capRun ≥ 3`, off at `capRun` 0 | 6 |
| 5.5 | Estimate with `prodFromRise` and `sizeFor` | 6 |
| 5.5 | `sizeText` (three texts, number formats), in `why.air` and the alarm event; last non-null rise rate | 6 |
| 5.6 | Manual | 2 |
| 5.6 | P1 safety, 20 ppm hysteresis, ignores cap and minimum off (not a purge) | 2 |
| 5.6 | P2 humidity first | 4 |
| 5.6 | P3 purge | 2 |
| 5.6 | P3 timed purge: share, run, period, `st.air.timed` | 5 |
| 5.6 | P4 free cooling, outdoor drying | 2 |
| 5.6 | Sensor check: no rate test on a falling CO₂ while `cmd.air.on` and for one reading after the fans stop; a rise tested as today | 8 |
| 5.7 | `ctl.purges()` replaces `ctl.exhaust()`; `cur` in the event shape with `end`, `co2End` `null` and `capped: false`; event and hour shapes; 200 events, 168 h | 2 |
| 5.7 | `st.stats`; purge counts for state `purge` only, `airOnS` for every run | 2 |
| 5.7 | `status('CO2')` order, with `Safety run` after `co2Hi` | 2, 3, 4 |
| 5.7 | `why.air` for `idle`, `prepare`, `purge`, `after` | 2, 3 |
| 5.7 | Events | 2 (on, off, cap), 4 (delayed), 5 (timed), 6 (alarm) |
| 5.7 | Removed: `acPurge()`, setback, `purgeHeld`, `purgeReduced`, `airLevel`, `AIR_STEP_S`, fog boost | 2 |
| 5.7 | Snapshot upgrade | 7 |
| 9 | `pack` (both copies), `cmdFields` | 10 |
| 9 | `crowded-dry`, `capped-purges` (with `cfg: { airM3h: 900 }`) | 10 |
| 9 | Regeneration | Not this stream (lead, step 2) |
| 11 | Controller tests: 5.3 transitions, 30 s, `minOffS` | 2, 3 |
| 11 | Four Prepare directions and the small push; AC and fogger targets in `prepare` / `purge` and back after | 3 |
| 11 | Humidity first never past `co2Lim`; safety ignores the cap | 4, 2 |
| 11 | Timed purge share, run, period | 5 |
| 11 | Size alarm after 3 capped purges, its text, its clearing | 6 |
| 11 | `status('CO2')`; old snapshot upgrade | 2–5, 7 |
| 11 | Settings: version 1 warnings, `manual.fan` → `manual.air`, `fanOn` / `fanOff` kept; version 2 round trip; new ranges clamp | 1, 2 |

### Placeholder scan

Searched this brief for "TBD", "TODO", "fill in", "similar to", "as above" and "etc.": none. Every code step has the full code. Each task's code was applied in order to a copy of `<base>` and its tests were run: the fail and pass counts in each task are the measured ones.

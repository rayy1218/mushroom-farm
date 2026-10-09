# Work brief: Air exchange (C9), Data stream

Date: 2026-10-09. Repo: `/home/foqcus/Documents/mushroom-farm`. Worktree: `~/.config/superpowers/worktrees/mushroom-farm/air-data` (branch `stream/air-data`). In this brief, `<base>` means the step 0 commit your branch starts from (`git merge-base HEAD master`). Contract C9 (`docs/contracts/air.md`) is frozen. Where this brief and C9 disagree, C9 wins: stop and report it to the lead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this brief task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

Every task below was run once on a copy of `<base>` before this brief was written: each commit leaves `npm test` at `# fail 0`. The lead answered the contract questions of the first draft (section 10); C9 already holds the answers.

## 1. Goal

Move the server side of the app from the one fresh-air fan (levels 0–3, `rooms.vent`) to the air exchange of C9: an on/off intake + exhaust pair, recorded as `air` 0/1.

| Part | Files | Result |
|---|---|---|
| Database upgrade 2 | `server/db.js` | `SCHEMA_V2_AIR` (C9 6.2, verbatim) appended to `UPGRADES`; every reading statement uses `air`; rooms have no `vent` |
| Fake database | `tests/fakes/db.js` | Same shapes: `air` CHECK `IN (0, 1)`, no `vent`, `version: 2` |
| Room manager | `server/rooms.js`, `server/rooms-common.js`, `server/sim-adapter.js`, `tests/fakes/rooms.js` | Reading row `air`; no `vent` anywhere; `TARGET_KEYS` = the 6 ramp keys; one pair correction (`fanOn`/`fanOff`); stored and given settings go through `ClimateController.upgradeSettings` (real and fake manager); the simulated room runs with `settings.airM3h`; `air.js` required first |
| Shared rules and API | `room-rules.js`, `server/api.js` | `vent` is an unknown field; `ALARM_KEYS` has `airTooSmall` |
| Tests | `tests/db.test.js`, `tests/fake-db.test.js`, `tests/rooms.test.js`, `tests/fake-rooms.test.js`, `tests/rooms-common.test.js`, `tests/api.test.js`, `tests/stream.test.js`, `tests/room-rules.test.js` | C9 section 11, data rows |

## 2. Owned files (the only files you may change)

| File | At `<base>` | What you change | Tasks |
|---|---|---|---|
| `server/db.js` | wave 1 | `SCHEMA_V2_AIR`, `UPGRADES`, room and reading statements | 5 |
| `server/rooms.js` | wave 1 | Requires, `TARGET_KEYS`, pair correction, `buildReadingRow`, `vent` removal, `upgradeAndImport` | 2, 3, 5, 6 |
| `server/rooms-common.js` | wave 1 | `DEMO_ROOM` without `vent` | 5 |
| `server/sim-adapter.js` | wave 1 | Requires `../air.js`; `env.vent` no longer set; `env.airM3h = cfg.airM3h` | 2, 4 |
| `server/api.js` | wave 1 | `vent` no longer read | 5 |
| `room-rules.js` | wave 1 | `ALARM_KEYS`, `normRoom`, `checkRoom` | 1, 5 |
| `tests/fakes/db.js` | wave 1 | Key `air`, no `vent`, `version: 2` | 5 |
| `tests/fakes/rooms.js` | wave 1 | Requires `../../air.js`; no `vent`; `upgradeSettings` before its import | 2, 5, 6 |
| `tests/db.test.js` | wave 1 | Upgrade 2 tests, shapes | 2, 5 |
| `tests/fake-db.test.js` | wave 1 | Shapes | 2, 5 |
| `tests/rooms.test.js` | wave 1 | Gates, shapes, new tests | 2, 3, 4, 5, 6 |
| `tests/fake-rooms.test.js` | wave 1 | Shapes, upgrade test | 2, 5, 6 |
| `tests/rooms-common.test.js` | wave 1 | `DEMO_ROOM` pin without `vent` | 5 |
| `tests/api.test.js` | wave 1 | Shapes | 2, 5 |
| `tests/stream.test.js` | wave 1 | Shapes | 5 |
| `tests/room-rules.test.js` | wave 1 | Shapes | 1, 2, 5 |

Every other file is read-only for you: `air.js`, `sim.js`, `controller.js`, `runtime.js`, `capacity.js`, `calib.js`, `cycle.js`, `web/**`, `index.html`, `styles.css`, `package.json`, `docs/**`, `tests/vectors/**`, `tests/harness.js`, `tests/integration.test.js`, `tests/web-*.test.js`, `tests/fakes/api-server.js` (no change needed).

## 3. Read first

| Document | Sections | Why |
|---|---|---|
| `docs/contracts/air.md` (C9) | 1, 2, 3, 5.2 (`upgradeSettings` only), 5.7 (snapshot row), 6, 10, 11 | **Your contract** |
| `docs/superpowers/specs/2026-10-08-air-exchange-purge-design.md` | 3, 5 | Why the reading key and the settings change |
| `docs/superpowers/plans/2026-10-08-air-exchange/README.md` | Files table, Step 1, Task 2.1 | Your place in the plan; the merge order (simulation, controller, data, web) |
| `docs/contracts/db.md` (C1) | 3, 4, 6.4, 6.6, 9 | The upgrade rules (`BEGIN IMMEDIATE` per upgrade, released upgrades never edited) and the fake |
| `docs/contracts/rooms.md` (C2) | 5.3, 6.1, 9.2 step 7, 13.1, 17 | The rows C9 section 10 overrides |
| `docs/contracts/api.md` (C3) | 7 | `checkRoom`, `normRoom`, `ALARM_KEYS` |
| `air.js` | all | `ClimateAir` (you only require it) |

## 4. Contracts you build against

### 4.1 What changes (C9 section 6)

| Item | Rule | Task |
|---|---|---|
| Reading key | `fan` → `air`: raw row `0`/`1` (`cmd.air && cmd.air.on ? 1 : 0`); bucket row = the fraction of readings with `air` 1 | 5 |
| `UPGRADES` | `[{ version: 1, sql: SCHEMA_V1 }, { version: 2, sql: SCHEMA_V2_AIR }]`; upgrade 1 unchanged | 5 |
| `SCHEMA_V2_AIR` | The SQL of C9 6.2, character for character | 5 |
| Room object | `{ id, name, volume, adapter, created_at, archived_at }` | 5 |
| `db.createRoom`, `db.updateRoom` | `vent` is an unknown field (`TypeError: createRoom: unknown field "vent"`) | 5 |
| `TARGET_KEYS` | `['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff']` | 3 |
| Pair correction | `rules.fanOn` / `rules.fanOff` only | 3 |
| `rooms.update` | `vent` gives `unknown field "vent"`; a room restarts only when its volume changed | 5 |
| `rooms.create`, `DEMO_ROOM` | No `vent` | 5 |
| `RULES.checkRoom` | `vent` gives `vent: unknown field` | 5 |
| `RULES.normRoom` | No `vent` key | 5 |
| `server/api.js` | Passes only `name`, `volume`, `settings` to `rooms.create`; only `name`, `volume` to `rooms.update` | 5 |
| `sim-adapter.js` | `env.vent` not set | 4 |
| Simulated size | `sim-adapter.js` sets `env.airM3h = settings.airM3h` when it builds the env (the adapter's `cfg` argument); a saved change reaches the sim at the next loop restart | 4 |
| Fake manager | `tests/fakes/rooms.js` runs `upgradeSettings` before its import too | 6 |
| `ALARM_KEYS` | Adds `'airTooSmall'` | 1 |
| Requires | `../air.js` before `../controller.js` (`server/rooms.js`) and before `../sim.js` (`server/sim-adapter.js`); tests that load `controller.js` load `air.js` first (C9 3) | 2 |
| Stored settings | `ClimateController.upgradeSettings(obj)` before `importSettings`; its warnings join the import warnings | 6 |
| `rooms.create` | Ignores unknown input keys (C2 4), so it ignores `vent`; `checkRoom`, `rooms.update` and the db reject it | 5 |
| `RULES.normRoom` | Keeps its key set: no `vent`, and no `airM3h` (no per-room size until C8, C9 8) | 5 |
| `server/api.js` requires | Unchanged (C9 3, C3 4.1) | none |
| Snapshots | Passed to `create` unchanged (lines 217, 312 stay as they are) | none |

### 4.2 What you use from other streams (contract only)

At `<base>` none of these exist. Your code and tests handle that as below; nothing of theirs is copied into your files.

| From | Thing (C9 section) | At `<base>` | How your code handles it | How your tests handle it |
|---|---|---|---|---|
| Controller stream | `ClimateController.upgradeSettings(obj) → { settings, warnings }` (5.2) | missing | `upgradeAndImport` (real manager) and `mergeAndImport` (fake) call it only when `typeof ClimateController.upgradeSettings === 'function'` | Stub tests (task 6) replace it with a spy; the real-function test is skipped by `NEEDS_CTL` |
| Controller stream | `settings.airM3h` (5.2) | missing (`undefined`) | `env.airM3h = cfg.airM3h` sets `undefined`; the sim treats it as `null` (`?? PLANT.air.m3h`, C9 4.2) | The env test sets `cfg.airM3h = 900` itself |
| Controller stream | `cmd.air = { on }` (5.1) | the controller sends `cmd.fan` | `air: cmd.air && cmd.air.on ? 1 : 0` gives `0` | Task 5 wraps `ctl.update` to add `air`; the manual-On test is skipped by `NEEDS_CTL` |
| Controller stream | `manual.air`, 6 `RAMP_KEYS` (5.2) | v1 settings | – | Skipped by `NEEDS_CTL` |
| Simulation stream | `cmd.air.on` read by `sim.js`, `DEFAULT_ENV.airM3h`, `view().airM3h` (4.1, 4.2) | `sim.js` reads `cmd.fan.level` and throws without it | – | The four adapter tests that step the sim with an `air` command are skipped by `NEEDS_SIM` |

The gates (task 3, top of `tests/rooms.test.js`):

```js
const NEEDS_CTL = typeof CC.upgradeSettings !== 'function' && 'needs the controller stream (C9 section 5.2)';
const NEEDS_SIM = !('airM3h' in SIM.DEFAULT_ENV) && 'needs the simulation stream (C9 section 4.1)';
```

`node:test` runs a test given `{ skip: false }` and skips it (printing the text) given a string.

### 4.3 Rules this brief fixes (C9 leaves the detail open)

| Subject | Rule |
|---|---|
| `airTooSmall` position | Appended after `'shockLimit'` |
| Warning order | `cleanSettings` warnings, then `upgradeSettings` warnings, then `importSettings` warnings |
| Where `upgradeSettings` runs | On the object given to `importSettings` at the three call sites (`version.settings` at loop start; `merged` in `create` and `applySettings`). In `applySettings` this also covers the base read from the database when the room has no loop (line 622). In the fake: on `merged` in `mergeAndImport` (used by its `create` and `applySettings`). |
| Fake `air` column | Accepts `true`/`false` like `lights` and `circ` (the real db's `val()` turns them into 1/0) |
| Version 1 test file | Written with raw SQL: `UPGRADES[0].sql` plus the `schema_version` table, as the released app wrote it. `openDb(file, { upgrades: [UPGRADES[0]] })` cannot make it: the new statements need the `air` column at open. |
| Test databases | `tmpFile(t)` (already in `tests/db.test.js`): a folder made with `fs.mkdtempSync(path.join(os.tmpdir(), 'farm-db-'))`, removed after the test |

### 4.4 Commands

| Purpose | Command |
|---|---|
| All tests | `npm test` |
| One file | `node --disable-warning=ExperimentalWarning --test tests/<file>.test.js` |
| Some tests of one file | `node --disable-warning=ExperimentalWarning --test --test-name-pattern="<text>" tests/<file>.test.js` |

## 5. Tasks

TDD for every task: write the failing test, run it and see it fail for the stated reason, implement, see it pass, run `npm test`, commit only that task's files with the repo's configured git identity. Line numbers are at `<base>`; earlier tasks add lines above some of them, so find each place by its text.

### Task 0: Preflight (no code)

| Step | Command | Expected |
|---|---|---|
| 1 | `git -C ~/.config/superpowers/worktrees/mushroom-farm/air-data branch --show-current` | `stream/air-data` |
| 2 | `ls air.js docs/contracts/air.md tests/air.test.js` | All three exist |
| 3 | `grep -n '^Status' docs/contracts/air.md` | `Status: frozen (lead decision 55), …` |
| 4 | `node -e "require('./air.js'); require('./sim.js'); require('./controller.js'); console.log(Object.keys(ClimateAir).join(), typeof ClimateController.upgradeSettings, 'airM3h' in ClimateSim.DEFAULT_ENV)"` | `SIZES,MIN_POINTS,steadyPpm,purgeTimeS,sizeFor,riseRate,prodFromRise undefined false` |
| 5 | `npm test` | `# fail 0`. Write down the pass count N. |
| If anything differs | Stop and report to the lead | – |

### Task 1: `ALARM_KEYS` gets `airTooSmall` (C9 6.3)

**Files:** `room-rules.js` (line 17), `tests/room-rules.test.js` (lines 27–29).

- [ ] **Step 1: Write the failing test.** In `tests/room-rules.test.js`, test `LIM, VERDICTS, ALARM_KEYS`, replace

```js
    assert.deepStrictEqual(R.ALARM_KEYS, [
      'tHi', 'tLo', 'tCrop', 'coreHi', 'rhHi', 'rhLo', 'co2Hi', 'co2Safe', 'disagree', 'acTooSmall', 'blocksDone', 'shockLimit',
    ]);
```

with

```js
    assert.deepStrictEqual(R.ALARM_KEYS, [
      'tHi', 'tLo', 'tCrop', 'coreHi', 'rhHi', 'rhLo', 'co2Hi', 'co2Safe', 'disagree', 'acTooSmall', 'blocksDone', 'shockLimit',
      'airTooSmall',
    ]);
```

- [ ] **Step 2: Run it.** `node --disable-warning=ExperimentalWarning --test tests/room-rules.test.js` → FAIL in `LIM, VERDICTS, ALARM_KEYS` (the list has 12 keys, 13 expected).

- [ ] **Step 3: Implement.** `room-rules.js` line 17 becomes:

```js
  const ALARM_KEYS = ['tHi', 'tLo', 'tCrop', 'coreHi', 'rhHi', 'rhLo', 'co2Hi', 'co2Safe', 'disagree', 'acTooSmall', 'blocksDone', 'shockLimit', 'airTooSmall'];
```

- [ ] **Step 4: Run.** The file → pass. `npm test` → `# fail 0`, pass N.

- [ ] **Step 5: Commit.**

```bash
git add room-rules.js tests/room-rules.test.js
git commit -m "feat(room-rules): airTooSmall alarm key (C9 6.3)"
```

### Task 2: Require `air.js` first (C9 3, 6.3)

**Files:** `server/rooms.js` (lines 2–4), `server/sim-adapter.js` (lines 2–5), `tests/fakes/rooms.js` (line 5), `tests/rooms.test.js` (lines 5, 78, 236–240), `tests/db.test.js` (line 13), `tests/fake-db.test.js` (line 5), `tests/fake-rooms.test.js` (line 4), `tests/api.test.js` (line 15), `tests/room-rules.test.js` (line 8).

- [ ] **Step 1: Write the failing tests.** In `tests/rooms.test.js`, test `rooms: exports`, replace

```js
  for (const child of mod.children) {
    assert.ok(/[\\/](controller|runtime|sim-adapter|rooms-common)\.js$/.test(child.id), `unexpected require: ${child.id}`);
  }
```

with

```js
  for (const child of mod.children) {
    assert.ok(/[\\/](air|controller|runtime|sim-adapter|rooms-common)\.js$/.test(child.id), `unexpected require: ${child.id}`);
  }
  // C9 section 6.3: air.js is required before controller.js.
  const names = mod.children.map(c => c.id.replace(/^.*[\\/]/, ''));
  assert.ok(names.includes('air.js'), `air.js not required: ${names}`);
  assert.ok(names.indexOf('air.js') < names.indexOf('controller.js'), `air.js after controller.js: ${names}`);
```

and insert before `test('sim adapter: constants', () => {` (line 78):

```js
test('sim adapter: requires air.js before sim.js (C9 section 6.3)', () => {
  const mod = require.cache[require.resolve('../server/sim-adapter.js')];
  const names = mod.children.map(c => c.id.replace(/^.*[\\/]/, ''));
  assert.deepEqual(names, ['air.js', 'sim.js', 'runtime.js']);
  assert.equal(typeof globalThis.ClimateAir.purgeTimeS, 'function');
});

```

- [ ] **Step 2: Run.** `node --disable-warning=ExperimentalWarning --test tests/rooms.test.js` → 2 FAIL: `sim adapter: requires air.js before sim.js` and `rooms: exports`.

- [ ] **Step 3: Implement.** `server/rooms.js` lines 1–4 become:

```js
// server/rooms.js: the room manager (C2 sections 1-12, 15). CommonJS, synchronous.
'use strict';
require('../air.js');
require('../controller.js');
require('../runtime.js');
```

`server/sim-adapter.js` lines 1–5 become:

```js
// server/sim-adapter.js: the simulated room adapter (C2 section 13).
// Loads only ../air.js, ../sim.js and ../runtime.js (C2 section 1, C9 section 6.3).
'use strict';
require('../air.js');
require('../sim.js');
require('../runtime.js');
```

`tests/fakes/rooms.js`: insert before line 5 (`require('../../controller.js'); // defines globalThis.ClimateController`):

```js
require('../../air.js'); // C9 section 3: before controller.js
```

- [ ] **Step 4: Tests load `air.js` first (C9 3).** Insert the line `require('../air.js');` directly above the first shared-module require in each file:

| File | Insert above (line at `<base>`) |
|---|---|
| `tests/rooms.test.js` | 5 `require('../controller.js');` |
| `tests/db.test.js` | 13 `require('../sim.js');` |
| `tests/fake-db.test.js` | 5 `require('../controller.js');` |
| `tests/fake-rooms.test.js` | 4 `require('../controller.js');` |
| `tests/api.test.js` | 15 `require('../sim.js');` |
| `tests/room-rules.test.js` | 8 `require('../sim.js');` |

- [ ] **Step 5: Run.** `tests/rooms.test.js` → pass. `npm test` → `# fail 0`, pass N + 1.

- [ ] **Step 6: Commit.**

```bash
git add server/rooms.js server/sim-adapter.js tests/fakes/rooms.js tests/rooms.test.js tests/db.test.js tests/fake-db.test.js tests/fake-rooms.test.js tests/api.test.js tests/room-rules.test.js
git commit -m "feat(server): require air.js before controller.js and sim.js (C9 6.3)"
```

### Task 3: `TARGET_KEYS` follow the ramp keys; one pair correction (C9 5.2, 6.3)

**Files:** `server/rooms.js` (lines 8, 579–580), `tests/rooms.test.js` (lines 9, 230, 249, 1348–1358, 1443–1444, 1447–1471).

- [ ] **Step 1: Add the cross-stream gates.** In `tests/rooms.test.js`, after line 9 (`const SIM = globalThis.ClimateSim;`) insert:

```js

// C9 cross-stream gates: a test that needs another air-exchange stream is skipped (with this reason) until
// the lead merges that stream at step 2. After the merge both are false and every test runs.
const NEEDS_CTL = typeof CC.upgradeSettings !== 'function' && 'needs the controller stream (C9 section 5.2)';
const NEEDS_SIM = !('airM3h' in SIM.DEFAULT_ENV) && 'needs the simulation stream (C9 section 4.1)';
```

- [ ] **Step 2: Write the failing tests.** In test `rooms: exports`, replace line 230

```js
  assert.deepEqual(rooms.TARGET_KEYS, Object.keys(CC.profileTargets('oyster', 'fruiting')));
```

with

```js
  assert.deepEqual(rooms.TARGET_KEYS, ['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff']);
```

Insert before `test('rooms: defaultAdapterFactory', () => {`:

```js
test('rooms: TARGET_KEYS follow the controller ramp keys (C9 section 6.3)', { skip: NEEDS_CTL }, () => {
  assert.deepEqual(rooms.TARGET_KEYS, Object.keys(CC.profileTargets('oyster', 'fruiting')));
});

```

In test `Settings rules` (lines 1347–1358) replace

```js
  const keep = {
    spRH: cfg.spRH, co2Lim: cfg.co2Lim, fanOn: cfg.rules.fanOn, fanOff: cfg.rules.fanOff,
    acOff: cfg.rules.acOff, acOn: cfg.rules.acOn, safetyAt: cfg.rules.co2SafetyAt,
  };
```

with

```js
  const keep = {
    spRH: cfg.spRH, co2Lim: cfg.co2Lim, fanOn: cfg.rules.fanOn, fanOff: cfg.rules.fanOff,
    safetyAt: cfg.rules.co2SafetyAt,
  };
```

and delete the two lines

```js
  assert.equal(cfg.rules.acOff, keep.acOff);
  assert.equal(cfg.rules.acOn, keep.acOn);
```

In test `Pair correction`, delete line 1444:

```js
  assert.ok(!imported.warnings.some(w => w.includes('AC "until" level')));
```

Replace lines 1447–1471 (the comment block that starts `// Note (contract gap, reported to the lead)` and the whole test `Pair correction, high key`) with:

```js
// The high key changed and the low key kept: oyster fruiting -> rest ramps fanOff 700 -> 1700 upwards, so
// the edit merged over the stale base passes importSettings while the live check does not (C2 9.2 step 7).
test('Pair correction, high key', () => {
  const s = scripted();
  const { mgr, jump } = setup(s.factory);
  mgr.start();
  mgr.applySettings(1, { stage: 'rest' });
  jump(14256); // f = 0.99 along the ramp: live fanOn 1890, fanOff 1690
  const result = mgr.applySettings(1, { rules: { fanOn: 1650 } });
  assert.equal(result.settings.rules.fanOn, 1740);
  assert.equal(result.settings.rules.fanOff, 1690);
  assert.deepEqual(result.warnings, ['"rules.fanOn" = 1650 must be at least 50 ppm above "rules.fanOff" (1690 now): set to 1740.']);
});
```

- [ ] **Step 3: Run.** `tests/rooms.test.js` → 1 FAIL (`rooms: exports`: 8 keys, 6 expected), 1 skipped (`TARGET_KEYS follow the controller ramp keys`).

- [ ] **Step 4: Implement.** `server/rooms.js` line 8 becomes:

```js
const TARGET_KEYS = ['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff'];
```

Delete line 580:

```js
    pairCorrect(cfg, 'rules.acOff', 'rules.acOn', changed, pairWarnings);
```

- [ ] **Step 5: Run.** The file → pass (1 skipped). `npm test` → `# fail 0`, pass N + 1, skipped 1.

- [ ] **Step 6: Commit.**

```bash
git add server/rooms.js tests/rooms.test.js
git commit -m "feat(rooms): target keys follow the ramp keys; fanOn/fanOff the only pair (C9 6.3)"
```

### Task 4: The simulated adapter: no `env.vent`, its own `env.airM3h` (C9 6.3)

**Files:** `server/sim-adapter.js` (lines 23–25), `tests/rooms.test.js` (lines 95, 98, 102, 109, 132, 146, 160, 169, 187, 201, 206, and a new test before the `// Task 2: Module surface …` section line).

- [ ] **Step 1: Write the failing tests.** In test `sim adapter: env`:

| Line | Old | New |
|---|---|---|
| 95 | `  const room = { id: 1, volume: 80, vent: 'exhaust', adapter: 'sim' };` | `  const room = { id: 1, volume: 80, adapter: 'sim' };` |
| 98 | `  cfg.stage = 'pinning';` | `  cfg.stage = 'pinning';` and a new line below it: `  cfg.airM3h = 900;` |
| 102 | `  assert.equal(capturedEnv.vent, 'exhaust');` | `  assert.equal(capturedEnv.vent, SIM.DEFAULT_ENV.vent); // C9 section 6.3: env.vent is no longer set` and a new line below it: `  assert.equal(capturedEnv.airM3h, 900); // C9 section 6.3: the room's own size` |
| 109 | `    if (['vent', 'room', 'co2PerBlock', 'blocks', 'blockStage', 'startHour'].includes(k)) continue;` | `    if (['airM3h', 'room', 'co2PerBlock', 'blocks', 'blockStage', 'startHour'].includes(k)) continue;` |

Insert after the end of test `sim adapter: resume from a snapshot` (before the `// ----` line above `// Task 2: Module surface, listeners, factory …`):

```js
test('sim adapter: the simulated room runs with its own air exchange size (C9 section 6.3)', { skip: NEEDS_SIM }, () => {
  let clock = T0;
  const now = () => clock;
  const cfg = CC.defaultSettings();
  cfg.airM3h = 900;
  const a = createSimAdapter({ room: { id: 1, volume: 60, adapter: 'sim' }, calib: null, blocks: null, cfg, snapshot: null, now });
  a.io.write({ ac: { power: true, mode: 'cool', setpoint: 25, fan: 'auto' }, hu: { level: 0 }, air: { on: true }, lights: { on: false }, circ: { on: false } });
  clock += 1; a.io.advance(1);
  assert.equal(a.view().airM3h, 900); // fans on: the pair's flow, no leakage (C9 4.2 view)
});

```

- [ ] **Step 2: Adapter commands use `air` (C9 4.2).** In the four `a.io.write({ … })` lines (146, 169, 187, 206) replace `hu: { level: 0 }, fan: { level: 0 }, lights` with `hu: { level: 0 }, air: { on: false }, lights`. Three of those tests step the sim, which reads `cmd.fan.level` until the simulation stream merges, so gate them:

| Line | Old | New |
|---|---|---|
| 132 | `test('sim adapter: one reading per 30 s', (t) => {` | `test('sim adapter: one reading per 30 s', { skip: NEEDS_SIM }, (t) => {` |
| 160 | `test('sim adapter: CO₂ jitter', (t) => {` | `test('sim adapter: CO₂ jitter', { skip: NEEDS_SIM }, (t) => {` |
| 201 | `test('sim adapter: resume from a snapshot', () => {` | `test('sim adapter: resume from a snapshot', { skip: NEEDS_SIM }, () => {` |

`sim adapter: gap` (line 181) is not gated: it never steps the sim.

- [ ] **Step 3: Run.** `tests/rooms.test.js` → 1 FAIL (`sim adapter: env`: `undefined` is not `'supply'`), 5 skipped.

- [ ] **Step 4: Implement.** In `server/sim-adapter.js`, step 1 (lines 23–25)

```js
  const env = structuredClone(DEFAULT_ENV);
  env.vent = room.vent;
  env.room = { volume: room.volume };
```

becomes

```js
  const env = structuredClone(DEFAULT_ENV);
  env.airM3h = cfg.airM3h; // C9 section 6.3: the room's own air exchange size
  env.room = { volume: room.volume };
```

`cfg` is the loop's settings, so a saved `airM3h` reaches the sim when the loop restarts (C2 8.1 builds a new adapter).

- [ ] **Step 5: Run.** The file → pass, 5 skipped. `npm test` → `# fail 0`, pass N − 2, skipped 5.

- [ ] **Step 6: Commit.**

```bash
git add server/sim-adapter.js tests/rooms.test.js
git commit -m "feat(sim-adapter): no env.vent; env.airM3h from settings; adapter tests send air.on (C9 6.3)"
```

### Task 5: Database upgrade 2, reading key `air`, rooms without `vent`, end to end (C9 6.1–6.3)

The database, the fake, the room manager, the rules and the API change shape together: the fake rejects `vent` and `fan` as soon as it changes, and every caller passes them. So this task has one commit, at step 16. Between steps the tree is red; that is expected.

**Files:** all of section 2 except `server/sim-adapter.js`.

#### Part A: the real database

- [ ] **Step 1: Write the failing test.** In `tests/db.test.js`, change the two helpers (lines 52–60):

| Line | Old | New |
|---|---|---|
| 53 | `  return Object.assign({ name: 'A', volume: 60, vent: 'supply', settings: { spT: 18 } }, over);` | `  return Object.assign({ name: 'A', volume: 60, settings: { spT: 18 } }, over);` |
| 58 | `    ac_mode: 'cool', ac_setpoint: 18, fog: 1, fan: 1, lights: 1, circ: 1, power_w: 100, kwh: 1,` | `    ac_mode: 'cool', ac_setpoint: 18, fog: 1, air: 1, lights: 1, circ: 1, power_w: 100, kwh: 1,` |

Then insert before the section line `// Task 3: Rooms (C1 section 6.4)` (line 250, with its `// ----` line above it):

```js

// C9 sections 6.1, 6.2: upgrade 2 on a file written by the released app (schema version 1).
function writeVersion1File(file) {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL) STRICT;');
  raw.exec(UPGRADES[0].sql);
  raw.prepare('INSERT INTO schema_version (version, applied_at) VALUES (1, ?)').run(T0 - 86400);
  const room = raw.prepare('INSERT INTO rooms (id, name, volume, vent, adapter, created_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  room.run(1, 'Room 1', 60, 'exhaust', 'sim', T0 - 86400, null);
  room.run(2, 'Old', 40, 'supply', 'sim', T0 - 86400, T0 - 3600);
  raw.prepare('INSERT INTO room_settings (room_id, saved_at, settings, note) VALUES (1, ?, ?, ?)').run(T0 - 86400, '{"spT":18}', 'Created');
  const reading = raw.prepare(
    'INSERT INTO readings (room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh) ' +
    "VALUES (?, ?, 20, 80, 900, 30, 60, 'fan', NULL, 1, ?, 1, 0, 100, 1)"
  );
  [0, 1, 2, 3].forEach((fan, i) => reading.run(1, T0 + 30 * i, fan));
  reading.run(2, T0 - 7200, 2);
  raw.prepare("INSERT INTO events (room_id, t, level, text) VALUES (1, ?, 'info', 'Started')").run(T0 - 86400);
  raw.prepare("INSERT INTO controller_state (room_id, saved_at, controller, sim) VALUES (1, ?, '{\"a\":1}', NULL)").run(T0 - 60);
  raw.close();
}

test('real: upgrade 2 turns fan 0-3 into air 0/1 and drops rooms.vent (C9 6.2)', t => {
  const file = tmpFile(t);
  writeVersion1File(file);

  const db = openDb(file, { now: () => T0 });
  assert.equal(db.version, 2);
  assert.deepStrictEqual(db.getRoom(1), { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: T0 - 86400, archived_at: null });
  assert.equal(db.getRoom(2).archived_at, T0 - 3600);
  const rows = db.queryReadings(1, { from: T0, to: T0 + 90 });
  assert.deepStrictEqual(rows.map(r => r.air), [0, 1, 1, 1]);
  assert.deepStrictEqual(rows[0], {
    room_id: 1, t: T0, T: 20, RH: 80, CO2: 900, t_out: 30, rh_out: 60, ac_mode: 'fan', ac_setpoint: null,
    fog: 1, air: 0, lights: 1, circ: 0, power_w: 100, kwh: 1,
  });
  assert.equal(db.queryReadings(2, { from: T0 - 7200, to: T0 - 7200 })[0].air, 1);
  assert.equal(db.queryReadings(1, { from: T0, to: T0 + 90, step: 3600 })[0].air, 0.75);
  assert.deepStrictEqual(db.currentSettings(1).settings, { spT: 18 });
  assert.equal(db.listEvents(1).length, 1);
  assert.deepStrictEqual(db.loadControllerState(1).controller, { a: 1 });
  db.insertReading(1, reading(T0 + 120, { air: 1 }));
  assertSql(() => db.insertReading(1, reading(T0 + 150, { air: 2 })), 275);
  assert.equal(db.createRoom(roomInput({ name: 'New' })).id, 3);
  db.close();

  const raw = new DatabaseSync(file);
  t.after(() => raw.close());
  assert.deepStrictEqual(raw.prepare('SELECT version, applied_at FROM schema_version ORDER BY version').all().map(r => ({ ...r })), [
    { version: 1, applied_at: T0 - 86400 }, { version: 2, applied_at: T0 },
  ]);
  const cols = table => raw.prepare('SELECT name FROM pragma_table_info(?)').all(table).map(r => r.name);
  assert.deepStrictEqual(cols('rooms'), ['id', 'name', 'volume', 'adapter', 'created_at', 'archived_at']);
  assert.deepStrictEqual(cols('readings'), [
    'room_id', 't', 'temp', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint',
    'fog', 'air', 'lights', 'circ', 'power_w', 'kwh',
  ]);
  assert.equal(raw.prepare("SELECT strict FROM pragma_table_list() WHERE name = 'readings'").get().strict, 1);
  assert.deepStrictEqual(raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'readings'").all().map(r => r.name), ['readings_room_t']);
  assert.deepStrictEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
});

```

- [ ] **Step 2: Run it.** `node --disable-warning=ExperimentalWarning --test --test-name-pattern="upgrade 2" tests/db.test.js` → FAIL at `assert.equal(db.version, 2)` (it is 1).

- [ ] **Step 3: Implement the real database.** In `server/db.js`, replace line 113

```js
const UPGRADES = [{ version: 1, sql: SCHEMA_V1 }];
```

with

```js
// Schema version 2 (C9 section 6.2, verbatim): the reading key fan (0-3) becomes air (0/1); rooms.vent is dropped.
const SCHEMA_V2_AIR = `
CREATE TABLE readings_new (
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  t           INTEGER NOT NULL,
  temp        REAL,
  RH          REAL,
  CO2         REAL,
  t_out       REAL,
  rh_out      REAL,
  ac_mode     TEXT    NOT NULL CHECK (ac_mode IN ('off', 'cool', 'heat', 'dry', 'fan')),
  ac_setpoint REAL,
  fog         INTEGER NOT NULL CHECK (fog BETWEEN 0 AND 3),
  air         INTEGER NOT NULL CHECK (air IN (0, 1)),
  lights      INTEGER NOT NULL CHECK (lights IN (0, 1)),
  circ        INTEGER NOT NULL CHECK (circ IN (0, 1)),
  power_w     REAL,
  kwh         REAL
) STRICT;
INSERT INTO readings_new (room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh)
  SELECT room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, CASE WHEN fan > 0 THEN 1 ELSE 0 END, lights, circ, power_w, kwh FROM readings;
DROP TABLE readings;
ALTER TABLE readings_new RENAME TO readings;
CREATE INDEX readings_room_t ON readings (room_id, t);
ALTER TABLE rooms DROP COLUMN vent;
`;

// Released upgrades are never edited; a new one is appended (C1 section 3).
const UPGRADES = [
  { version: 1, sql: SCHEMA_V1 },
  { version: 2, sql: SCHEMA_V2_AIR },
];
```

Then change the statements (`SCHEMA_V1`, lines 9–111, stays exactly as it is). Where a cell holds only part of a line, replace that part and keep the rest of the line.

| Line | Old | New |
|---|---|---|
| 227 | `    'INSERT INTO rooms (name, volume, vent, adapter, created_at) VALUES (:name, :volume, :vent, :adapter, :created_at)'` | `    'INSERT INTO rooms (name, volume, adapter, created_at) VALUES (:name, :volume, :adapter, :created_at)'` |
| 231 | `  const updateVentStmt = conn.prepare('UPDATE rooms SET vent = :v WHERE id = :id');` | (delete the line) |
| 251 | `    fields('createRoom', room, ['name', 'volume', 'vent', 'adapter', 'settings', 'note', 'at']);` | `    fields('createRoom', room, ['name', 'volume', 'adapter', 'settings', 'note', 'at']);` |
| 258 | `        name: val(r.name), volume: val(r.volume), vent: val(r.vent), adapter: val(adapter), created_at: val(at),` | `        name: val(r.name), volume: val(r.volume), adapter: val(adapter), created_at: val(at),` |
| 269 | `    fields('updateRoom', changes, ['name', 'volume', 'vent']);` | `    fields('updateRoom', changes, ['name', 'volume']);` |
| 277 | `      if ('vent' in c) updateVentStmt.run({ v: val(c.vent), id });` | (delete the line) |
| 338 | `'fog', 'fan', 'lights'` (in `READING_KEYS`) | `'fog', 'air', 'lights'` |
| 340 | `    'INSERT INTO readings (room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh) ' +` | `    'INSERT INTO readings (room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh) ' +` |
| 341 | `    'VALUES (:room_id, :t, :temp, :RH, :CO2, :t_out, :rh_out, :ac_mode, :ac_setpoint, :fog, :fan, :lights, :circ, :power_w, :kwh)'` | `    'VALUES (:room_id, :t, :temp, :RH, :CO2, :t_out, :rh_out, :ac_mode, :ac_setpoint, :fog, :air, :lights, :circ, :power_w, :kwh)'` |
| 343 | `  const RAW_READINGS_COLS = 'room_id, t, temp AS T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh';` | `  const RAW_READINGS_COLS = 'room_id, t, temp AS T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh';` |
| 351 | `    SELECT room_id, b AS t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh` | `    SELECT room_id, b AS t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh` |
| 356 | `             AVG(ac_setpoint) AS ac_setpoint, AVG(fog) AS fog, AVG(fan) AS fan,` | `             AVG(ac_setpoint) AS ac_setpoint, AVG(fog) AS fog, AVG(air) AS air,` |
| 375 | `      fog: val(r.fog), fan: val(r.fan), lights: val(r.lights), circ: val(r.circ), power_w: val(r.power_w), kwh: val(r.kwh),` | `      fog: val(r.fog), air: val(r.air), lights: val(r.lights), circ: val(r.circ), power_w: val(r.power_w), kwh: val(r.kwh),` |

The full new line 338:

```js
  const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'air', 'lights', 'circ', 'power_w', 'kwh'];
```

- [ ] **Step 4: Run.** The step 2 command → PASS.

- [ ] **Step 5: The rest of `tests/db.test.js`.**

Where a cell holds only part of a line, replace that part and keep the rest of the line.

| Line | Test | Old | New |
|---|---|---|---|
| 78 | `open gives path and version` | `  assert.equal(db.version, 1);` | `  assert.equal(db.version, 2);` |
| 106 | `real: openDb(path, null) …` | `  assert.equal(db.version, 1);` | `  assert.equal(db.version, 2);` |
| 141 | `real: opening a file creates …` | `    'fog', 'fan', 'lights', 'circ', 'power_w', 'kwh',` | `    'fog', 'air', 'lights', 'circ', 'power_w', 'kwh',` |
| 181 | `real: reopening a file applies no upgrade twice` | `    { version: 1, applied_at: T0 },` | `    { version: 1, applied_at: T0 }, { version: 2, applied_at: T0 },` |
| 189 | `real: upgrades apply in order` | `    { version: 2, sql: 'CREATE TABLE extra_a (x INTEGER) STRICT;' },` | `    { version: 3, sql: 'CREATE TABLE extra_a (x INTEGER) STRICT;' },` |
| 190 | same | `    { version: 3, sql: 'ALTER TABLE extra_a ADD COLUMN y INTEGER;' },` | `    { version: 4, sql: 'ALTER TABLE extra_a ADD COLUMN y INTEGER;' },` |
| 193 | same | `  assert.equal(db.version, 3);` | `  assert.equal(db.version, 4);` |
| 198 | same | `    { version: 1 }, { version: 2 }, { version: 3 },` | `    { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 },` |
| 208 | `real: a failed upgrade leaves no trace …` | `{ version: 2, sql: 'CREATE TABLE fk_probe` | `{ version: 3, sql: 'CREATE TABLE fk_probe` |
| 210 | same | `/^Schema upgrade 2 failed: /` | `/^Schema upgrade 3 failed: /` |
| 213 | same | `  assert.equal(db.version, 1);` | `  assert.equal(db.version, 2);` |
| 217 | same | `[{ version: 1 }]);` | `[{ version: 1 }, { version: 2 }]);` |
| 225 | `real: a database newer than the app …` | `    { version: 2, sql: 'CREATE TABLE extra_a (x INTEGER) STRICT;' },` | `    { version: 3, sql: 'CREATE TABLE extra_a (x INTEGER) STRICT;' },` |
| 226 | same | `    { version: 3, sql: 'ALTER TABLE extra_a ADD COLUMN y INTEGER;' },` | `    { version: 4, sql: 'ALTER TABLE extra_a ADD COLUMN y INTEGER;' },` |
| 230 | same | ``    message: `The database ${file} has schema version 3; this app knows up to 1. Use a newer version of the app.`,`` | ``    message: `The database ${file} has schema version 4; this app knows up to 2. Use a newer version of the app.`,`` |
| 234 | same | `  assert.equal(raw.prepare('SELECT MAX(version) AS v FROM schema_version').get().v, 3);` | `  assert.equal(raw.prepare('SELECT MAX(version) AS v FROM schema_version').get().v, 4);` |
| 242 | `real: a room inserted with raw SQL has no settings` | `  raw.exec("INSERT INTO rooms (name, volume, vent, created_at) VALUES ('x', 10, 'supply', 1)");` | `  raw.exec("INSERT INTO rooms (name, volume, created_at) VALUES ('x', 10, 1)");` |
| 259 | `createRoom: defaults, first settings version` | `    id: room.id, name: 'A', volume: 60, vent: 'supply', adapter: 'sim', created_at: T0, archived_at: null,` | `    id: room.id, name: 'A', volume: 60, adapter: 'sim', created_at: T0, archived_at: null,` |
| 326 | `updateRoom: fields, unchanged, unknown field, bad value` | `  assert.equal(db.updateRoom(room.id, { vent: 'exhaust' }).vent, 'exhaust');` | (delete the line) |
| 434 | `insertReading: round trip, T <-> temp` | `fog: 1, fan: 2, lights: 1` | `fog: 1, air: 1, lights: 1` |
| 553 | `bucketFixture` | `    T: 20, RH: 80, CO2: null, ac_mode: 'cool', ac_setpoint: 18, fog: 1, lights: 1, kwh: 1,` | `    T: 20, RH: 80, CO2: null, ac_mode: 'cool', ac_setpoint: 18, fog: 1, air: 1, lights: 1, kwh: 1,` |
| 556 | same | `    T: null, RH: 90, CO2: null, ac_mode: 'off', ac_setpoint: null, fog: 2, lights: 0, kwh: 1.25,` | `    T: null, RH: 90, CO2: null, ac_mode: 'off', ac_setpoint: null, fog: 2, air: 0, lights: 0, kwh: 1.25,` |
| 559 | same | `    T: 21, RH: 85, CO2: 900, ac_mode: 'cool', ac_setpoint: 18, fog: 3, lights: 1, kwh: 2,` | `    T: 21, RH: 85, CO2: 900, ac_mode: 'cool', ac_setpoint: 18, fog: 3, air: 1, lights: 1, kwh: 2,` |
| 1161 | `constraint rules: one row per rule, nothing stored` | `  assertSql(() => db.updateRoom(roomId, { vent: 'north' }), 275);` | (delete the line) |
| 1166 | same | `  assertSql(() => db.insertReading(roomId, reading(T0, { fan: -1 })), 275);` | `  assertSql(() => db.insertReading(roomId, reading(T0, { air: 2 })), 275);` |
| 1175 | same | `  { const r = roomInput(); delete r.vent; assertSql(() => db.createRoom(r), 1299); }` | (delete the line) |
| 1180 | same | `  { const r = reading(T0); delete r.fan; assertSql(() => db.insertReading(roomId, r), 1299); }` | `  { const r = reading(T0); delete r.air; assertSql(() => db.insertReading(roomId, r), 1299); }` |
| 1194 | same | `  assertSql(() => db.insertReading(roomId, reading(T0, { fan: 1.5 })), 3091);` | `  assertSql(() => db.insertReading(roomId, reading(T0, { air: 1.5 })), 3091);` |

Multi-line edits in the same file:

| Edit | Where | Do |
|---|---|---|
| D1 | `real: opening a file creates …`, after the `]);` that closes the readings columns (line 142) | Insert the block D1 below |
| D2 | `updateRoom: fields, unchanged, unknown field, bad value`, lines 336–337 | Replace with block D2 |
| D3 | `updateRoom: all or nothing when a later field breaks a rule`, lines 345–348 | Replace with block D3 |
| D4 | `queryReadings: bucket averages …`, after line 577 (`assert.equal(b0.fog, 1.5); …`) | Insert block D4 |
| D5 | Before `both('queryReadings: bucket row keys equal raw row keys', …` (line 582) | Insert block D5 |

D1:

```js
  const roomCols = raw.prepare('SELECT name FROM pragma_table_info(?)').all('rooms').map(r => r.name);
  assert.deepStrictEqual(roomCols, ['id', 'name', 'volume', 'adapter', 'created_at', 'archived_at']);
```

D2 replaces

```js
  assertSql(() => db.updateRoom(room.id, { vent: 'north' }), 275);
  assert.equal(db.getRoom(room.id).vent, 'exhaust');
```

with

```js
  assert.throws(() => db.updateRoom(room.id, { vent: 'supply' }), { name: 'TypeError', message: 'updateRoom: unknown field "vent"' });
  assertSql(() => db.updateRoom(room.id, { volume: 0 }), 275);
  assert.equal(db.getRoom(room.id).volume, 80);
```

D3 replaces

```js
  assertSql(() => db.updateRoom(room.id, { name: 'B', vent: 'north' }), 275);
  assert.deepStrictEqual(db.getRoom(room.id), before);
  assertSql(() => db.updateRoom(room.id, { name: 'C', volume: 80, vent: 'north' }), 275);
  assert.deepStrictEqual(db.getRoom(room.id), before);
```

with

```js
  assertSql(() => db.updateRoom(room.id, { name: 'B', volume: 0 }), 275);
  assert.deepStrictEqual(db.getRoom(room.id), before);
  assertSql(() => db.updateRoom(room.id, { name: 'C', volume: NaN }), 1299);
  assert.deepStrictEqual(db.getRoom(room.id), before);
```

D4:

```js
  assert.equal(b0.air, 0.5); assert.equal(b1.air, 1);
```

D5:

```js
both('queryReadings: bucket air is the fraction of readings with the air exchange on (C9 6.1)', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  [1, 1, 1, 0].forEach((air, i) => db.insertReading(roomId, reading(T0 + 30 * i, { air })));
  assert.equal(db.queryReadings(roomId, { from: T0, to: T0 + 90, step: 120 })[0].air, 0.75);
});

```

- [ ] **Step 6: Run.** `node --disable-warning=ExperimentalWarning --test tests/db.test.js` → every `real:` test passes; `fake:` tests fail (the fake still has `fan` and `vent`).

#### Part B: the fake database

- [ ] **Step 7: Implement the fake.** In `tests/fakes/db.js`:

Where a cell holds only part of a line, replace that part and keep the rest of the line.

| Line | Old | New |
|---|---|---|
| 9 | `const VENTS = ['supply', 'exhaust'];` | (delete the line) |
| 74 | `fog, fan, lights` (in the comment) | `fog, air, lights` |
| 97 | `    return { id: r.id, name: r.name, volume: r.volume, vent: r.vent, adapter: r.adapter, created_at: r.created_at, archived_at: r.archived_at };` | `    return { id: r.id, name: r.name, volume: r.volume, adapter: r.adapter, created_at: r.created_at, archived_at: r.archived_at };` |
| 107 | `      ac_mode: r.ac_mode, ac_setpoint: r.ac_setpoint, fog: r.fog, fan: r.fan, lights: r.lights, circ: r.circ,` | `      ac_mode: r.ac_mode, ac_setpoint: r.ac_setpoint, fog: r.fog, air: r.air, lights: r.lights, circ: r.circ,` |
| 138 | `    checkFields(room, ['name', 'volume', 'vent', 'adapter', 'settings', 'note', 'at'], 'createRoom');` | `    checkFields(room, ['name', 'volume', 'adapter', 'settings', 'note', 'at'], 'createRoom');` |
| 141 | `    const vent = numColumn(room.vent, { type: 'TEXT', notNull: true, check: v => VENTS.includes(v), name: 'rooms.vent' });` | (delete the line) |
| 148 | `    const roomRow = { id, name, volume, vent, adapter, created_at: at, archived_at: null };` | `    const roomRow = { id, name, volume, adapter, created_at: at, archived_at: null };` |
| 175 | `    checkFields(changes, ['name', 'volume', 'vent'], 'updateRoom');` | `    checkFields(changes, ['name', 'volume'], 'updateRoom');` |
| 179 | `    if ('vent' in changes) updated.vent = numColumn(changes.vent, { type: 'TEXT', notNull: true, check: v => VENTS.includes(v), name: 'rooms.vent' });` | (delete the line) |
| 233 | `'fog', 'fan', 'lights'` | `'fog', 'air', 'lights'` |
| 251 | `    const fan = numColumn(reading.fan, { type: 'INTEGER', notNull: true, check: v => v >= 0 && v <= 3, name: 'readings.fan' });` | `    const air = numColumn(reading.air, { type: 'INTEGER', boolInt: true, notNull: true, check: v => v === 0 \|\| v === 1, name: 'readings.air' });` |
| 255 | `      room_id: roomId, t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh,` | `      room_id: roomId, t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh,` |
| 284 | `        fog: meanAll('fog'), fan: meanAll('fan'), lights: meanAll('lights'), circ: meanAll('circ'),` | `        fog: meanAll('fog'), air: meanAll('air'), lights: meanAll('lights'), circ: meanAll('circ'),` |
| 530 | `    version: 1,` | `    version: 2,` |

The full new line 251 (the table escapes its `||`):

```js
    const air = numColumn(reading.air, { type: 'INTEGER', boolInt: true, notNull: true, check: v => v === 0 || v === 1, name: 'readings.air' });
```

- [ ] **Step 8: `tests/fake-db.test.js`.** First remove every `vent` from the room inputs:

```bash
sed -i -E "s/, vent: '(supply|exhaust)'//g" tests/fake-db.test.js
```

Then (lines at `<base>`; the `sed` changes no line count; where a cell holds only part of a line, replace that part):

| Line | Old | New |
|---|---|---|
| 21, 38 | `  assert.equal(db.version, 1);` | `  assert.equal(db.version, 2);` |
| 95, 151, 223 | `fog: 0, fan: 0, lights` (inside each line) | `fog: 0, air: 0, lights` |
| 215 | `  badCreate({ vent: 'side' }, 275);` | (delete the line) |
| 408 | `fog: 1, fan: 2, lights: 1` | `fog: 1, air: 1, lights: 1` |
| 417 | `'fog', 'fan', 'lights'` | `'fog', 'air', 'lights'` |
| 443 | `  db.insertReading(1, validReading({ t: 95, T: 20, fog: 2, lights: 0, ac_mode: 'off', ac_setpoint: null, kwh: null }));` | `  db.insertReading(1, validReading({ t: 95, T: 20, fog: 2, air: 1, lights: 0, ac_mode: 'off', ac_setpoint: null, kwh: null }));` |
| 444 | `  db.insertReading(1, validReading({ t: 65, T: 10, fog: 1, lights: 1, ac_mode: 'cool', ac_setpoint: 18, kwh: 1 }));` | `  db.insertReading(1, validReading({ t: 65, T: 10, fog: 1, air: 0, lights: 1, ac_mode: 'cool', ac_setpoint: 18, kwh: 1 }));` |

Inserts:

| After line (`<base>`) | Insert |
|---|---|
| 239 `  badReading({ ac_mode: 'auto' }, 275);` | block F1 |
| 381 `  assert.deepEqual(db1.listRooms().map(r => r.id), [1]);` (test `TypeError for unknown fields; nothing stored`) | block F2 |
| 450 `  assert.equal(b.fog, 1.5);` | block F3 |

F1:

```js
  badReading({ air: 2 }, 275);
  badReading({ air: 1.5 }, 3091);
  badReading({ air: undefined }, 1299);
```

F2:

```js
  assert.throws(() => db1.createRoom({ name: 'B', volume: 10, vent: 'supply', settings: freshSettings() }), { name: 'TypeError', message: 'createRoom: unknown field "vent"' });
  assert.throws(() => db1.updateRoom(1, { vent: 'supply' }), { name: 'TypeError', message: 'updateRoom: unknown field "vent"' });
  assert.deepEqual(db1.listRooms().map(r => r.id), [1]);
```

F3:

```js
  assert.equal(b.air, 0.5); // the fraction of readings with the air exchange on (C9 6.1)
```

- [ ] **Step 9: Run.** `node --disable-warning=ExperimentalWarning --test tests/db.test.js tests/fake-db.test.js` → `# fail 0`.

#### Part C: callers (room manager, rules, API)

- [ ] **Step 10: Remove `vent` from the caller tests.** Run this before the edits of step 11 (some of them add a `vent` on purpose):

```bash
sed -i -E "s/, vent: '(supply|exhaust)'//g; s/vent: '(supply|exhaust)', //g; s/,\"vent\":\"supply\"//g" \
  tests/rooms.test.js tests/fake-rooms.test.js tests/api.test.js tests/stream.test.js tests/room-rules.test.js
```

Check: `grep -n "vent" tests/rooms.test.js tests/fake-rooms.test.js tests/api.test.js tests/stream.test.js tests/room-rules.test.js | grep -v event` lists only the lines step 11 changes, plus the task 4 line `capturedEnv.vent`.

- [ ] **Step 11: Write the failing caller tests.** One-line edits (text after the `sed`; where a cell holds only part of a line, replace that part):

| File | Line (`<base>`) | Old | New |
|---|---|---|---|
| `tests/rooms.test.js` | 416 | `  expectError({ name: 'A', volume: 60, vent: 'side' }, ['vent must be "supply" or "exhaust"']);` | (delete the line) |
| `tests/rooms.test.js` | 440 | `'fog', 'fan', 'lights'` (in `READING_KEYS`) | `'fog', 'air', 'lights'` |
| `tests/rooms.test.js` | 476 | `  assert.equal(row.fan, Math.min(3, Math.max(0, Math.round(lastCmd.fan.level \|\| 0))));` | `  assert.equal(row.air, lastCmd.air && lastCmd.air.on ? 1 : 0);` |
| `tests/fake-rooms.test.js` | 133 | `    assert.ok(err.details.includes('vent must be "supply" or "exhaust"'));` | `    assert.equal(err.details.length, 2); // no vent rule (C9 section 6.3)` |
| `tests/room-rules.test.js` | 135 | `    assert.equal(R.checkRoom({ name: 'A', volume: 60 }, false).length, 1);` | (delete the line: the body is now valid) |
| `tests/api.test.js` | 41 | `fog: 1, fan: 1, lights: 1` | `fog: 1, air: 1, lights: 1` |
| `tests/api.test.js` | 282 | `      { name: 'A', volume: 60 },                              // missing vent` | (delete the line: the body is now valid) |
| `tests/api.test.js` | 290 | `      { name: 'A', volume: 60, vent: 'side' },` | `      { name: 'A', volume: 60, vent: 'supply' },              // vent is an unknown field (C9 6.3)` |
| `tests/api.test.js` | 352 | `    for (const body of [{}, { archived: false }, { colour: 1 }, { volume: 1 }]) {` | `    for (const body of [{}, { archived: false }, { colour: 1 }, { volume: 1 }, { vent: 'supply' }]) {` |
| `tests/api.test.js` | 515 | `        'CO2', 'RH', 'T', 'ac_mode', 'ac_setpoint', 'circ', 'fan', 'fog', 'kwh', 'lights', 'power_w', 'rh_out', 'room_id', 't', 't_out',` | `        'CO2', 'RH', 'T', 'ac_mode', 'ac_setpoint', 'air', 'circ', 'fog', 'kwh', 'lights', 'power_w', 'rh_out', 'room_id', 't', 't_out',` |
| `tests/stream.test.js` | 108, 161 | `fog: 1, fan: 1, lights: 1` | `fog: 1, air: 1, lights: 1` |

Multi-line edits:

| Edit | File | Where | Do |
|---|---|---|---|
| R1 | `tests/rooms.test.js` | Test `Demo room`, line 322 | Replace with block R1 |
| R2 | `tests/rooms.test.js` | Test `Errors: create input`, lines 423–430 | Replace with block R2 |
| R3 | `tests/rooms.test.js` | Before the section line `// Task 5: Controller events and alarms …` (line 626, with its `// ----` line above it) | Insert block R3 |
| R4 | `tests/rooms.test.js` | Test `Whole machine levels`, lines 1266–1283 | Replace the whole test with block R4 |
| R5 | `tests/rooms.test.js` | Test `update`, lines 1537–1540 | Replace with block R5 |
| R6 | `tests/fake-rooms.test.js` | Test `update: …`, after line 149 (`… unknown field "colour"'));`) | Insert block R6 |
| R7 | `tests/room-rules.test.js` | Lines 109–113 (`test('vent other than exhaust -> supply', …`) | Replace with block R7 |
| R8 | `tests/room-rules.test.js` | Lines 148–150 (`test('vent rule', …`) | Replace with block R8 |

R1 replaces `  assert.equal(room.vent, 'supply');` with:

```js
  assert.ok(!('vent' in room)); // C9 section 6.3: rooms have no vent
  assert.deepEqual(roomsCommon.DEMO_ROOM, { name: 'Room 1', volume: 60 });
```

R2 replaces

```js
    mgr.create({ name: '', volume: 4.9, vent: 'side' });
    assert.fail('expected a RoomError');
  } catch (err) {
    assert.deepStrictEqual(err.details, [
      'name must be 1 to 60 characters',
      'volume must be a number from 5 to 5000 (m³)',
      'vent must be "supply" or "exhaust"',
    ]);
```

with

```js
    mgr.create({ name: '', volume: 4.9 });
    assert.fail('expected a RoomError');
  } catch (err) {
    assert.deepStrictEqual(err.details, [
      'name must be 1 to 60 characters',
      'volume must be a number from 5 to 5000 (m³)',
    ]);
```

R3:

```js
test('Recording: air is 1 while cmd.air.on, else 0 (C9 section 6.3)', (t) => {
  let airOn = true;
  const origCreate = CC.create;
  CC.create = (cfg, snapshot, onEvent) => {
    const ctl = origCreate(cfg, snapshot, onEvent);
    const update = ctl.update;
    ctl.update = r => ({ ...update(r), air: { on: airOn } });
    return ctl;
  };
  t.after(() => { CC.create = origCreate; });

  const { db, mgr, step } = setup(scripted().factory);
  mgr.start();
  assert.equal(db.latestReading(1).air, 1);
  airOn = false;
  step(30);
  assert.equal(db.latestReading(1).air, 0);
});

```

R4 (the whole new pair of tests; the second replaces the old `baseFan: 5` case, C9 section 10):

```js
test('Whole machine levels', () => {
  const { db, mgr, step } = setup();
  mgr.start();
  const { room: a } = mgr.create({ name: 'A', volume: 60 });
  mgr.applySettings(a.id, { manual: { hu: { auto: false, level: 1.5 } } });

  const fatalLog = [];
  mgr.on('fatal', p => fatalLog.push(p));
  step(30);

  const rowA = db.queryReadings(a.id, { from: 0, to: 10 ** 12 }).at(-1);
  assert.equal(rowA.fog, 2);
  assert.equal(fatalLog.length, 0);
});

// C9 section 10: the air exchange is on or off; a manual On (in place of the old baseFan: 5) records air 1.
test('Whole machine levels: manual air exchange On records air 1', { skip: NEEDS_CTL }, () => {
  const { db, mgr, step } = setup();
  mgr.start();
  const { room: b } = mgr.create({ name: 'B', volume: 60 });
  mgr.applySettings(b.id, { manual: { air: { auto: false, on: true } } });
  step(30);
  const rowB = db.queryReadings(b.id, { from: 0, to: 10 ** 12 }).at(-1);
  assert.equal(rowB.air, 1);
});
```

R5 replaces

```js
    mgr.update(1, { vent: 'side' });
    assert.fail('expected bad_input');
  } catch (err) {
    assert.deepEqual(err.details, ['vent must be "supply" or "exhaust"']);
```

with

```js
    mgr.update(1, { vent: 'supply' });
    assert.fail('expected bad_input');
  } catch (err) {
    assert.deepEqual(err.details, ['unknown field "vent"']); // C9 section 6.3
```

R6:

```js
  assert.throws(() => rooms.update(room.id, { vent: 'supply' }), err => err.details.includes('unknown field "vent"'));
```

R7:

```js
  test('vent is not kept (C9 section 6.3)', () => {
    assert.ok(!('vent' in R.normRoom({ vent: 'exhaust' }, 0)));
    assert.ok(!('vent' in R.normRoom({}, 0)));
  });
```

R8:

```js
  test('vent is an unknown field (C9 section 6.3)', () => {
    assert.deepStrictEqual(R.checkRoom({ name: 'A', volume: 60, vent: 'supply' }, false), ['vent: unknown field']);
    assert.deepStrictEqual(R.checkRoom({ vent: 'supply' }, true), ['vent: unknown field', 'body: at least one field is required']);
  });
```

- [ ] **Step 12: Run.** Each of the five files with `node --disable-warning=ExperimentalWarning --test tests/<file>.test.js`:

| File | Expected now |
|---|---|
| `tests/rooms.test.js` | Many FAIL (`createRoom: unknown field "vent"` from the manager, `row.air` undefined) |
| `tests/fake-rooms.test.js` | FAIL (the fake manager still passes `vent`) |
| `tests/api.test.js` | FAIL (`vent` still allowed; `fan` rows) |
| `tests/room-rules.test.js` | FAIL (`vent` still kept and checked) |
| `tests/stream.test.js` | pass (it only relays objects) |
| `tests/rooms-common.test.js` | pass until step 13 changes `DEMO_ROOM` (step 14 updates its pin) |

- [ ] **Step 13: Implement the callers.**

`server/rooms.js`:

| Line | Old | New |
|---|---|---|
| 69–73 | the whole `function validateVent(vent, details) { … }` (5 lines) | (delete) |
| 94 | `    fan: clampLevel(cmd.fan.level),` | `    air: cmd.air && cmd.air.on ? 1 : 0,` |
| 477 | `    const vent = validateVent(obj.vent, details);` | (delete the line) |
| 500 | `    const room = db.createRoom({ name, volume, vent, adapter: 'sim', settings, note: FIRST_NOTE, at: now() });` | `    const room = db.createRoom({ name, volume, adapter: 'sim', settings, note: FIRST_NOTE, at: now() });` |
| 518 | `      else if (key === 'vent') toApply.vent = validateVent(changesInput.vent, details);` | (delete the line) |

and lines 525–527

```js
    const volumeOrVentChanged = (('volume' in toApply) && toApply.volume !== room.volume) ||
      (('vent' in toApply) && toApply.vent !== room.vent);
    if (volumeOrVentChanged && loop && loop.running) {
```

become

```js
    const volumeChanged = ('volume' in toApply) && toApply.volume !== room.volume;
    if (volumeChanged && loop && loop.running) {
```

`buildReadingRow` (lines 82–100) after the change, in full (`clampLevel` stays: `fog` uses it):

```js
function buildReadingRow(roomId, r, cmd) {
  return {
    room_id: roomId,
    t: Math.round(r.t),
    T: finiteOrNull(r.T),
    RH: finiteOrNull(r.RH),
    CO2: finiteOrNull(r.CO2),
    t_out: finiteOrNull(r.tOut),
    rh_out: finiteOrNull(r.rhOut),
    ac_mode: cmd.ac.power ? cmd.ac.mode : 'off',
    ac_setpoint: cmd.ac.power ? cmd.ac.setpoint : null,
    fog: clampLevel(cmd.hu.level),
    air: cmd.air && cmd.air.on ? 1 : 0,
    lights: cmd.lights.on ? 1 : 0,
    circ: cmd.circ.on ? 1 : 0,
    power_w: sumFinite(r.power),
    kwh: sumFinite(r.kwh),
  };
}
```

`server/rooms-common.js` line 13:

```js
const DEMO_ROOM = Object.freeze({ name: 'Room 1', volume: 60 });
```

`tests/fakes/rooms.js` (line numbers at `<base>`, before task 2 added one line):

| Line | Old | New |
|---|---|---|
| 83–87 | the whole `  function validateVent(vent, details) { … }` (5 lines) | (delete) |
| 109 | `    const vent = validateVent(obj.vent, details);` | (delete the line) |
| 126 | `    const room = db.createRoom({ name, volume, vent, adapter: 'sim', settings, note: FIRST_NOTE, at: now() });` | `    const room = db.createRoom({ name, volume, adapter: 'sim', settings, note: FIRST_NOTE, at: now() });` |
| 144 | `      else if (key === 'vent') toApply.vent = validateVent(changes.vent, details);` | (delete the line) |

`room-rules.js`:

| Line | Old | New |
|---|---|---|
| 46 | `      vent: r.vent === 'exhaust' ? 'exhaust' : 'supply',` | (delete the line) |
| 57 | `    const allowed = partial ? ['name', 'volume', 'vent', 'archived'] : ['name', 'volume', 'vent', 'settings'];` | `    const allowed = partial ? ['name', 'volume', 'archived'] : ['name', 'volume', 'settings'];` |
| 70–72 | the whole `    const checkVent = () => { … };` (3 lines) | (delete) |
| 76 | `      if (present('vent')) checkVent();` | (delete the line) |
| 78 | `      if (!present('name') && !present('volume') && !present('vent') && !present('archived')) {` | `      if (!present('name') && !present('volume') && !present('archived')) {` |
| 84 | `      checkVent();` | (delete the line) |

`server/api.js`:

| Line | Old | New |
|---|---|---|
| 202 | `    const result = rooms.create({ name: body.name, volume: body.volume, vent: body.vent, settings });` | `    const result = rooms.create({ name: body.name, volume: body.volume, settings });` |
| 210 | `    for (const k of ['name', 'volume', 'vent']) if (Object.hasOwn(body, k)) changes[k] = body[k];` | `    for (const k of ['name', 'volume']) if (Object.hasOwn(body, k)) changes[k] = body[k];` |

- [ ] **Step 14: `tests/rooms-common.test.js`.** Test `DEMO_ROOM and FIRST_NOTE`, line 21

```js
  assert.deepEqual(DEMO_ROOM, { name: 'Room 1', volume: 60, vent: 'supply' });
```

becomes

```js
  assert.deepEqual(DEMO_ROOM, { name: 'Room 1', volume: 60 });
```

- [ ] **Step 15: Run.** `npm test` → `# fail 0`, pass N + 2, skipped 6. Then:

| Check | Command | Expected |
|---|---|---|
| No `vent` left | `grep -n "vent" server/*.js room-rules.js tests/fakes/*.js \| grep -v -i event` | Only `server/db.js`: `SCHEMA_V1` line 14, the `SCHEMA_V2_AIR` comment, `ALTER TABLE rooms DROP COLUMN vent;` |
| No `fan` key left | `grep -nw "fan" server/*.js room-rules.js tests/fakes/*.js` | Only the AC mode `'fan'`, `SCHEMA_V1` line 75, the `SCHEMA_V2_AIR` comment and its `CASE WHEN fan > 0` |

- [ ] **Step 16: Commit.**

```bash
git add server/db.js server/rooms.js server/rooms-common.js server/api.js room-rules.js \
  tests/fakes/db.js tests/fakes/rooms.js \
  tests/db.test.js tests/fake-db.test.js tests/rooms.test.js tests/fake-rooms.test.js tests/rooms-common.test.js \
  tests/api.test.js tests/stream.test.js tests/room-rules.test.js
git commit -m "feat(db): upgrade 2, reading key air, rooms without vent, through rooms, rules and API (C9 6.1-6.3)"
```

### Task 6: Stored and given settings go through `upgradeSettings` (C9 5.2, 6.3)

**Files:** `server/rooms.js` (new function above `buildReadingRow`, line 82; call sites at lines 300, 492, 627), `tests/fakes/rooms.js` (`mergeAndImport`, lines 89–102 at `<base>`), `tests/rooms.test.js` (before `test('Errors', …)`, line 1697), `tests/fake-rooms.test.js` (end of file).

- [ ] **Step 1: Write the failing tests.** Insert before `test('Errors', () => {`:

```js
// C9 section 6.3: stored settings (and given settings merged over them) go through
// ClimateController.upgradeSettings before importSettings; its warnings come before the import warnings.
const REMOVED = 'Setting "rules.oldKey" was removed: fresh air now runs as short purges.';
function stubUpgrade(t) {
  const had = Object.hasOwn(CC, 'upgradeSettings'), orig = CC.upgradeSettings;
  const seen = [];
  CC.upgradeSettings = obj => {
    seen.push(structuredClone(obj));
    const settings = structuredClone(obj), warnings = [];
    if (settings.rules && 'oldKey' in settings.rules) { delete settings.rules.oldKey; warnings.push(REMOVED); }
    return { settings, warnings };
  };
  t.after(() => { if (had) CC.upgradeSettings = orig; else delete CC.upgradeSettings; });
  return seen;
}

test('Settings upgrade: loop start upgrades the stored version', (t) => {
  const seen = stubUpgrade(t);
  const { db, mgr } = setup(scripted().factory);
  const stored = CC.defaultSettings();
  stored.roomM3 = 60;
  stored.rules.oldKey = 1;
  db.createRoom({ name: 'Old', volume: 60, adapter: 'sim', settings: stored, note: 'Created', at: T0 });
  mgr.start();
  assert.deepEqual(seen, [stored]);
  const texts = db.listEvents(1, { limit: 50 }).map(e => e.text).reverse();
  assert.deepEqual(texts, [`Settings: ${REMOVED}`, 'Started']);
  assert.equal(mgr.get(1).live.running, true);
});

test('Settings upgrade: create and applySettings upgrade the merged settings', (t) => {
  stubUpgrade(t);
  const { db, mgr } = setup(scripted().factory);
  mgr.start();
  const created = mgr.create({ name: 'B', volume: 60, settings: { spT: 99, rules: { oldKey: 1 } } });
  assert.deepEqual(created.warnings, [REMOVED, '"spT" = 99 is outside 10–35: set to 35.']);
  assert.ok(!('oldKey' in db.currentSettings(created.room.id).settings.rules));
  const applied = mgr.applySettings(1, { rules: { oldKey: 2 } });
  assert.deepEqual(applied.warnings, [REMOVED]);
  assert.ok(!('oldKey' in db.currentSettings(1).settings.rules));
});

test('Settings upgrade: a stored version 1 settings object loads with warnings', { skip: NEEDS_CTL }, () => {
  const cap = capture(scripted().factory);
  const { db, mgr } = setup(cap.factory);
  const old = CC.defaultSettings();
  old.roomM3 = 60;
  old.rules.airMode = 'steady';
  old.rules.acOff = 900;
  old.rules.acOn = 700;
  delete old.manual.air;
  old.manual.fan = { auto: false, level: 2 };
  db.createRoom({ name: 'Old', volume: 60, adapter: 'sim', settings: old, note: 'Created', at: T0 });
  mgr.start();
  const texts = db.listEvents(1, { limit: 50 }).map(e => e.text);
  for (const key of ['rules.airMode', 'rules.acOff', 'rules.acOn', 'manual.fan']) {
    assert.ok(texts.includes(`Settings: Setting "${key}" was removed: fresh air now runs as short purges.`), key);
  }
  assert.ok(!texts.some(x => x.startsWith('Settings: Unknown setting')), texts.join('\n'));
  assert.equal(mgr.get(1).live.running, true);
  assert.deepEqual(cap.made[0].cfg.manual.air, { auto: false, on: true });
  assert.equal(cap.made[0].cfg.rules.fanOn, old.rules.fanOn);
});

```

Append to the end of `tests/fake-rooms.test.js` (the fake manager, C9 6.3 row "Fake manager"):

```js

test('create and applySettings: upgradeSettings runs before the import (C9 section 6.3)', (t) => {
  const REMOVED = 'Setting "rules.oldKey" was removed: fresh air now runs as short purges.';
  const had = Object.hasOwn(CC, 'upgradeSettings'), orig = CC.upgradeSettings;
  CC.upgradeSettings = obj => {
    const settings = structuredClone(obj), warnings = [];
    if (settings.rules && 'oldKey' in settings.rules) { delete settings.rules.oldKey; warnings.push(REMOVED); }
    return { settings, warnings };
  };
  t.after(() => { if (had) CC.upgradeSettings = orig; else delete CC.upgradeSettings; });

  const { db, rooms } = setup();
  const created = rooms.create({ name: 'A', volume: 60, settings: { spT: 99, rules: { oldKey: 1 } } });
  assert.deepEqual(created.warnings, [REMOVED, '"spT" = 99 is outside 10–35: set to 35.']);
  const applied = rooms.applySettings(created.room.id, { rules: { oldKey: 2 } });
  assert.deepEqual(applied.warnings, [REMOVED]);
  assert.ok(!('oldKey' in db.currentSettings(created.room.id).settings.rules));
});
```

- [ ] **Step 2: Run.** `node --disable-warning=ExperimentalWarning --test --test-name-pattern="Settings upgrade" tests/rooms.test.js` → 2 FAIL (the stub is never called: `seen` is `[]`; `Unknown setting "rules.oldKey" is ignored.` in place of the removal warning), 1 skipped. `node --disable-warning=ExperimentalWarning --test tests/fake-rooms.test.js` → 1 FAIL (the new test, same reason).

- [ ] **Step 3: Implement.** In `server/rooms.js`, insert directly above `function buildReadingRow(roomId, r, cmd) {`:

```js
// C9 section 6.3: settings from the database (and given settings merged over them) may be version 1, so
// ClimateController.upgradeSettings (C9 section 5.2) runs first; its warnings come before the import's own.
// The typeof guard is for the time before the controller stream is merged (C9 step 2).
function upgradeAndImport(settings) {
  const upgraded = typeof ClimateController.upgradeSettings === 'function'
    ? ClimateController.upgradeSettings(settings)
    : { settings, warnings: [] };
  const imported = ClimateController.importSettings({ format: SETTINGS_FORMAT, version: ClimateController.SETTINGS_VERSION, settings: upgraded.settings });
  return { settings: imported.settings, warnings: upgraded.warnings.concat(imported.warnings) };
}

```

Then the three call sites:

| Line | Old | New |
|---|---|---|
| 300 (loop start) | `      const imported = ClimateController.importSettings({ format: SETTINGS_FORMAT, version: ClimateController.SETTINGS_VERSION, settings: version.settings });` | `      const imported = upgradeAndImport(version.settings);` |
| 492 (`create`) | `        imported = ClimateController.importSettings({ format: SETTINGS_FORMAT, version: ClimateController.SETTINGS_VERSION, settings: merged });` | `        imported = upgradeAndImport(merged);` |
| 627 (`applySettings`) | `      imported = ClimateController.importSettings({ format: SETTINGS_FORMAT, version: ClimateController.SETTINGS_VERSION, settings: merged });` | `      imported = upgradeAndImport(merged);` |

The `try`/`catch` around each call stays: an error from either function is still `bad_input` in `create` and `applySettings`, and a room crash at loop start.

In `tests/fakes/rooms.js`, `mergeAndImport`, replace

```js
    const { settings: merged, warnings: dropped } = cleanSettings(settingsInput, base);
    let imported;
    try {
      imported = globalThis.ClimateController.importSettings({
        format: 'mushroom-climate-settings',
        version: globalThis.ClimateController.SETTINGS_VERSION,
        settings: merged,
      });
    } catch (err) {
      throw new RoomError('bad_input', 'Bad input', [err.message]);
    }
    return { settings: imported.settings, warnings: dropped.concat(imported.warnings) };
```

with

```js
    const { settings: merged, warnings: dropped } = cleanSettings(settingsInput, base);
    const CC = globalThis.ClimateController;
    let upgraded, imported;
    try {
      // C9 section 6.3: upgradeSettings first, like the real manager (typeof guard until the controller stream merges).
      upgraded = typeof CC.upgradeSettings === 'function' ? CC.upgradeSettings(merged) : { settings: merged, warnings: [] };
      imported = CC.importSettings({
        format: 'mushroom-climate-settings',
        version: CC.SETTINGS_VERSION,
        settings: upgraded.settings,
      });
    } catch (err) {
      throw new RoomError('bad_input', 'Bad input', [err.message]);
    }
    return { settings: imported.settings, warnings: dropped.concat(upgraded.warnings, imported.warnings) };
```

- [ ] **Step 4: Run.** The step 2 commands → pass (1 skipped in `tests/rooms.test.js`). `npm test` → `# fail 0`, pass N + 5, skipped 7.

- [ ] **Step 5: Commit.**

```bash
git add server/rooms.js tests/fakes/rooms.js tests/rooms.test.js tests/fake-rooms.test.js
git commit -m "feat(rooms): stored and given settings go through upgradeSettings, real and fake manager (C9 6.3)"
```

### Task 7: Final verification (no new code)

| # | Command | Expected |
|---|---|---|
| 1 | `npm test` | `# fail 0`; pass N + 5; skipped 7, each with a `needs the … stream` reason |
| 2 | `node --disable-warning=ExperimentalWarning --test tests/vectors.test.js` | All pass (you changed nothing they use) |
| 3 | `git diff --name-only <base>` | Only files of section 2 |
| 4 | `git diff <base> -- server/db.js \| grep -c '^-CREATE TABLE'` | `0` (upgrade 1 not edited) |
| 5 | `grep -n "saveControllerState\|ClimateController.create(" server/rooms.js` | The snapshot save and `create(loop.cfg, saved ? saved.controller : null, onEvent)` unchanged (C9 6.3: snapshots pass unchanged) |
| 6 | `node --disable-warning=ExperimentalWarning -e "const {openDb}=require('./server/db.js');const d=openDb(':memory:');console.log(d.version, Object.keys(d.createRoom({name:'x',volume:9,settings:{}})).join())"` | `2 id,name,volume,adapter,created_at,archived_at` |
| 7 | `git log --oneline <base>..HEAD` | 6 commits, tasks 1–6 |

Report to the lead: N before, the pass/skip counts after, and any new contract question.

## 6. Tests that wait for other streams

None of this stream's tests fail at any commit. These 7 are skipped until the lead merges the named stream; the gate then turns off by itself.

| Test (`tests/rooms.test.js`) | Gate | Why it cannot run at `<base>` | Passes after |
|---|---|---|---|
| `sim adapter: one reading per 30 s` | `NEEDS_SIM` | It steps the sim with `air: { on: false }`; the old `sim.js` reads `cmd.fan.level` and throws | Simulation merge |
| `sim adapter: CO₂ jitter` | `NEEDS_SIM` | Same | Simulation merge |
| `sim adapter: resume from a snapshot` | `NEEDS_SIM` | Same | Simulation merge |
| `sim adapter: the simulated room runs with its own air exchange size (C9 section 6.3)` | `NEEDS_SIM` | Same, and the old sim has no `view().airM3h` | Simulation merge |
| `rooms: TARGET_KEYS follow the controller ramp keys (C9 section 6.3)` | `NEEDS_CTL` | The old `profileTargets` still has `rules.acOff`, `rules.acOn` | Controller merge |
| `Whole machine levels: manual air exchange On records air 1` | `NEEDS_CTL` | The old controller has no `manual.air` and sends `cmd.fan` | Controller merge (needs the simulation merge too; it comes first) |
| `Settings upgrade: a stored version 1 settings object loads with warnings` | `NEEDS_CTL` | No `upgradeSettings`, no `manual.air` | Controller merge |

| Test outside this stream | Owner | Effect of this stream |
|---|---|---|
| `tests/web-api.test.js:24` | Web stream | Sends `vent` to `tests/fakes/api-server.js`, which does not check bodies: still passes; the web stream drops it |

## 7. Notes for the lead at merge (step 2)

| When | Note |
|---|---|
| After the simulation merge | `NEEDS_SIM` is false; the 4 adapter tests run. A failure there is an integration finding (`sim.js` and the adapter disagree on `cmd.air` or `env.airM3h`). |
| After the controller merge | `NEEDS_CTL` is false; the 3 controller-gated tests run. `upgradeAndImport` and the fake's `mergeAndImport` now call the real `upgradeSettings`; `env.airM3h` gets the room's `airM3h` (1800 by default). |
| Any time after both | Optional clean-up commit: remove `NEEDS_CTL`, `NEEDS_SIM` and their `{ skip: … }` options from `tests/rooms.test.js`, and the `typeof` guards from `upgradeAndImport` and the fake's `mergeAndImport`. |
| Live database check (task 2.5) | `openDb` on a copy of `farm.db` applies upgrade 2 once; `schema_version` then has rows 1 and 2. |

## 8. Done when

| # | Item |
|---|---|
| 1 | `UPGRADES` is `[1, 2]`; upgrade 2 is C9 6.2 character for character; upgrade 1 is unchanged |
| 2 | A version 1 file with `fan` 0–3 opens as version 2 with `air` 0/1, no `rooms.vent`, its settings, events and controller state kept, `foreign_key_check` empty, `integrity_check` `ok` |
| 3 | Real and fake: reading key `air`, `air: 2` → 275, `air: 1.5` → 3091, missing `air` → 1299, bucket `air` = fraction on, `vent` → `TypeError` unknown field, `version` 2 |
| 4 | `buildReadingRow` gives `air` from `cmd.air.on`; no `vent` in `rooms.js`, `rooms-common.js`, `sim-adapter.js`, `api.js`, `room-rules.js`, the fakes |
| 5 | `TARGET_KEYS` has 6 keys; only the `fanOn`/`fanOff` pair is corrected |
| 6 | Every `importSettings` call in `rooms.js` goes through `upgradeAndImport`; the fake's `mergeAndImport` runs `upgradeSettings` first |
| 7 | The adapter sets `env.airM3h = cfg.airM3h` and no `env.vent` |
| 8 | `ALARM_KEYS` ends with `'airTooSmall'`; `air.js` is required before `controller.js` and `sim.js` |
| 9 | Task 7 checks 1–7 give the expected results |
| 10 | One commit per task (6), only owned files |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit `SCHEMA_V1` or upgrade 1 | C1 3, C9 6.1: released upgrades are never edited |
| Change the SQL of `SCHEMA_V2_AIR` in any way | C9 6.2 is exact; the lead tested it under `BEGIN IMMEDIATE` with `foreign_keys = ON` |
| Write `upgradeSettings`, a `cmd.air` or `manual.air` into `controller.js`, or touch `sim.js` | Other streams own them (C9 2) |
| Add `air.js` to `server/api.js` | C9 3: `api.js` keeps its require list (C3 4.1) |
| Keep `airM3h` in `RULES.normRoom` | C9 8: no per-room size until C8 |
| Reject unknown keys in `rooms.create` | C9 6.3, C2 4: `create` ignores them |
| Run `npm run vectors` | It rewrites `tests/vectors/`; the lead regenerates them at step 2 |
| Push, merge, change git config, or edit a contract | The lead merges after review |

## 10. Contract questions (answered)

The lead answered the six questions of the first draft; C9 holds the answers (worktree commits `032246a`, `43fc32a`, `eb3fa04`; lead decision 55). This brief follows them.

| # | C9 section | Question | Ruling | Where in this brief |
|---|---|---|---|---|
| Q1 | 2 | `tests/rooms-common.test.js` pins `DEMO_ROOM` with `vent` and had no owner | The file is the data stream's (C9 2) | Section 2; task 5 step 14 |
| Q2 | 6.3 | `settings.airM3h` never reached the simulated room | New 6.3 row "Simulated size": the adapter sets `env.airM3h = settings.airM3h` when it builds the env; a saved change reaches the sim no later than the next loop restart | Task 4 (the sim-dependent test gated on `NEEDS_SIM`) |
| Q3 | 3 | Must `server/api.js` require `air.js`? | No: C9 3 now names modules that run a controller loop or the capacity check; `api.js` keeps its require list | Section 4.1; section 9 |
| Q4 | 6.3, 11 | `rooms.create` ignores `vent` rather than rejecting it | Accepted: `checkRoom`, `rooms.update` and the db reject `vent`; `rooms.create` ignores unknown keys (C2 4) | Section 4.1; task 5 |
| Q5 | 6.3 | The fake manager imported settings without `upgradeSettings` | New 6.3 row "Fake manager": `tests/fakes/rooms.js` runs `upgradeSettings` before its import | Task 6 |
| Q6 | 8 | `RULES.normRoom` drops `airM3h` | No per-room size until C8: `normRoom` keeps its key set and drops `airM3h` (C9 8) | Section 4.1; section 9 |

No question is open.

## 11. Self-review

### 11.1 Every C9 requirement of this stream, mapped to a task

| C9 | Requirement | Task, step |
|---|---|---|
| 2 | Only the data stream's files change (including `tests/rooms-common.test.js`) | 5 step 14; 7 check 3 |
| 3 | `air.js` before `controller.js` in modules that run a controller loop (`rooms.js`, `sim-adapter.js`, the fake manager) and in tests; `api.js` unchanged | 2 |
| 6.1 | Reading key `air`, raw 0/1 | 5 step 3 (db), step 7 (fake), step 13 (`buildReadingRow`) |
| 6.1 | Bucket `air` = fraction on | 5 step 3 (`AVG(air) AS air`), step 7 (`meanAll('air')`); tests D4, D5, F3 and the upgrade test (0.75) |
| 6.1 | `UPGRADES` appends `{ version: 2, sql: SCHEMA_V2_AIR }`; upgrade 1 not edited | 5 step 3; 7 check 4 |
| 6.1 | `SCHEMA_V2_AIR` is exactly 6.2 | 5 step 3 |
| 6.1 | `READING_KEYS`, insert, `RAW_READINGS_COLS`, bucket query, binding use `air` | 5 step 3 (lines 338, 340–341, 343, 351, 356, 375) |
| 6.1 | Room object without `vent` | 5 step 3 (insert, fields), step 1 test, D1; 7 check 6 |
| 6.1 | Fake: rename, CHECK `IN (0, 1)`, no `vent`, `version: 2` | 5 step 7; step 8 tests |
| 6.3 | `buildReadingRow` `air` | 5 step 13; test R3 |
| 6.3 | Stored settings through `upgradeSettings`, warnings joined | 6 |
| 6.3 | Simulated size: `env.airM3h = settings.airM3h` | 4 (env test; gated view test) |
| 6.3 | Fake manager runs `upgradeSettings` before its import | 6 (fake-rooms test) |
| 6.3 | Snapshots passed unchanged | No change; 7 check 5 |
| 6.3 | `TARGET_KEYS` follows `RAMP_KEYS` | 3 |
| 6.3 | Pair correction `fanOn`/`fanOff` only | 3 |
| 6.3 | `vent` removed: `validateVent`, `create`, `update`, `DEMO_ROOM`, fake rooms, `normRoom`, `checkRoom`, `api.js` | 5 steps 13–14; tests R1, R2, R5, R6, R7, R8, api rows 282/290/352, `rooms-common.test.js` line 21 |
| 8 | `RULES.normRoom` drops `airM3h` (keeps its key set) | 5 step 13 (no key added); R7 |
| 6.3 | `vent` removed: `sim-adapter.js` | 4 |
| 6.3 | `ALARM_KEYS` adds `'airTooSmall'` | 1 |
| 6.3 | Requires in `rooms.js`, `sim-adapter.js` | 2 |
| 10 | C2 "Whole machine levels" uses `manual.air` | 5 R4 (gated) |
| 10 | C2 "Recording", "Pair correction" | 5 step 11 (row 476), R3; 3 |
| 10 | C1 4.2, 6.2, 6.4, 6.6, 9 | 5 |
| 10 | C3 3.1, 3.2, 7 | 5 (api, rules, stream tests) |
| 11 | Upgrade 2 on a version 1 file with `fan` 0–3 → `air` 0/1, no `vent`, `db.version === 2` | 5 step 1 |
| 11 | `air: 2` rejected (275) | 5 step 5 row 1166, F1, upgrade test |
| 11 | Reading key `air` in rooms, api, stream, rules, fake-rooms tests | 5 step 11 |
| 11 | `vent` rejected as an unknown field (`checkRoom`, `rooms.update`, db; `rooms.create` ignores it) | 5 R5, R6, R8, api rows 290/352, D2, F2 |
| 11 | Stored version 1 settings load with warnings | 6 (stub test now; real test gated) |

### 11.2 Placeholder scan

| Check | Result |
|---|---|
| `TBD`, `TODO`, "fill in", "similar to" | None |
| Code steps without full code | None: each changed line or block is given in full, or as an exact part-of-line replacement (marked above each such table) |
| Steps that depend on a decision | None: all six questions are answered (section 10) |
| Test commands | Each run step names the command and the expected pass, fail or skip |

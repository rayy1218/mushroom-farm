# Work brief: Wave 2, Server 2 stream (C2 revision 9, C3/C4 revision 9)

Revision 1, 2026-10-09 (wave 2 contracts frozen on `master` e60dabf, lead decision 69). Stream: **Server 2** (wave 2). You are the implementer; two reviewers check the work before the lead merges it at gate 2.5.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–69 (for you mainly 6, 20, 21, 22, 27, 35, 48, 52, 56, 62, 63, 64) | `docs/contracts/LEAD-DECISIONS.md` | They override every contract and this brief |
| C3 and C4 revision 9 (HTTP API, live feed) | `docs/contracts/api.md` | `server/api.js`, `server/static.js`, `room-rules.js`, `tests/api.test.js`, `tests/room-rules.test.js` |
| C2 revision 9 (room manager) | `docs/contracts/rooms.md` | `server/rooms.js`, `server/sim-adapter.js`, `tests/rooms.test.js` |
| C1 revision 6 (database), through the fake only | `docs/contracts/db.md`, `tests/fakes/db.js` | The db calls and shapes (sections 6, 9) |
| C9 revision 2, section 6.3 (read-only) | `docs/contracts/air.md` | `air` reading key, settings upgrade, `env.airM3h`, the one CO₂ pair |
| C10 revision 2, sections 2, 7, 8.1, 8.2, 10, 13 (the `tests/api.test.js` row), 14 (C3 rows) | `docs/contracts/harvest.md` | `HttpError`, `opts.extraRoutes`, `/harvest-rules.js`, the `batch` / `crate` mapping |
| C8 revision 3, sections 4.3 and 4.5, through the prep 2.0 `equipment.js` stub | `docs/contracts/equipment.md` | `checkEquipment` (real in the stub), `plantOf` (throws `stub` until gate 2.5) |
| Wave 2 plan, sections 3 (Server 2 row), 3.1, 4, 5 (steps 3 and 3b) | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Owned files, rules, the gate |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/server-2.md` | Committed by the lead in prep 2.0; you do not edit it |

When this brief and a contract disagree, the contract wins: follow it and report the difference (section 10).

## 1. Goal

| Outcome | Measure |
|---|---|
| The API serves the room-centred app | Routes 6.20–6.26 (simulation runs, equipment) pass against the fakes; 6.8 and 6.13 have their revision 8 rules; `/cycle.js`, `/equipment.js`, `/harvest-rules.js` are served |
| The 6.26 save keeps the air exchange size in step (lead decision 35) | A `PUT /equipment` whose `air_m3h` differs from the settings' `airM3h` makes exactly one `applySettings(id, { airM3h }, 'Air exchange size from Your machines')`; an equal one makes none |
| C10's routes can plug in (lead decisions 62, 64) | `createApi(opts.extraRoutes)` mounts extra routes after the C3 routes and before `/api/stream`, with C3's room check, body reading and fault handling; `HttpError` comes from `server/api-common.js` with the field `error`; `mapError` maps `NotFoundError` `batch` / `crate` to 404 `Unknown batch` / `Unknown crate`; `DELETE` works for extra routes |
| `room-rules.js` checks runs and machines | `checkSimulationRun`, `checkRunPatch`, `checkEquipmentBody` and the extended `checkCalibration` (C3 7.4, 7.6, 7.7); it loads without `cycle.js` and `equipment.js` (C3 7.1) |
| The room manager records what wave 2 needs | 18-key readings (`ac_fan`, `stage`, `core`), `live.flush`, `live.blocks`, `live.air`; the room's machines reach the simulated room through `env.plant` (C2 13.1) |
| A db error at the loop-start upgrade save is thrown (C2 8.1) | The `Upgraded: air exchange` save sits outside the steps 2–6 `try`; test "Upgrade save error" |
| No prep 2.0 skip left in your test files | `grep -c "C1 rev 6 / C2 rev 9 fake:" tests/rooms.test.js tests/api.test.js` gives `0` for both |
| Your tests survive the Equipment merge (lead decision 56) | With `fixB-on-bd24755.diff` applied to `controller.js` in a scratch tree, your three test files give `# fail 0` |
| `server/main.js` can be wired at gate 2.5 | The `server/main.js` stub folder of `tests/api.test.js` also holds `tmp/server/harvest-db.js` and `tmp/server/harvest-api.js` (C3 12.1) |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/server-2` on branch `stream/server-2`, made by the lead from `master` after prep 2.0. `<worktree>` below is that path. Never work in `/home/foqcus/Documents/mushroom-farm` (another developer's tree). |
| Git | Keep the configured identity; never change `git config`. Plain commit messages (`feat(api): …`, `feat(rooms): …`, `test(rooms): …`), with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase (the lead merges; streams never merge `master` in). |
| Models and reviews | Implementer on Sonnet; a spec-compliance review and a code-quality review on Opus before the lead merges |
| `master` stays green | The lead merges you at gate 2.5 step 3, after Data 2 and Equipment, and `npm test` must stay green between merges. So your branch tip must pass `npm test` alone (the fakes and the `equipment.js` stub), and your tests must keep passing once Equipment's `controller.js` (lead decision 56) and the real `plantOf` land (task 12, section 7) |
| Contract questions | A gap or contradiction in a contract: stop that part, report it to the lead, continue with the other tasks. Only the lead changes a contract |

| Check (from `<worktree>`) | Expected; otherwise stop and report |
|---|---|
| `git branch --show-current` | `stream/server-2` |
| `ls equipment.js server/api-common.js harvest-rules.js tests/fakes/harvest-db.js tests/fakes/db.js tests/fakes/rooms.js docs/contracts/api.md docs/contracts/rooms.md` | All listed (prep 2.0) |
| `grep -c "Error('stub')" equipment.js` | At least `1` (still the prep 2.0 stub) |
| `node -e "const d=require('./tests/fakes/db.js').openFakeDb(); console.log(d.version, d.sqlite, typeof d.saveSimulationRun, typeof d.saveEquipment)"` | `4 null function function` |
| `node -e "require('./air.js');require('./controller.js');const db=require('./tests/fakes/db.js').openFakeDb();const m=require('./tests/fakes/rooms.js').createFakeRoomManager({db});m.create({name:'A',volume:60});const l=m.list()[0].live;console.log(l.air,l.flush,l.blocks)"` | `null null null` |
| `node -e "console.log(typeof require('./server/api-common.js').HttpError)"` | `function` |
| `grep -c "C1 rev 6 / C2 rev 9 fake:" tests/rooms.test.js tests/api.test.js` | `tests/rooms.test.js:2` and `tests/api.test.js:0`: the prep 2.0 skips (step 2b) of "Recording" and "One reading shape", each with the reason `'C1 rev 6 / C2 rev 9 fake: Server 2 rewrites this test'`; `tests/api.test.js` has none (its "readings default" key list already has the 18 keys). `P` = 2 |
| `grep -c "^test('Pair correction', " tests/rooms.test.js` and `grep -c "^test('Pair correction, high key'" tests/rooms.test.js` | `0` and `1` (prep 2.0 dropped the low-key test, lead decision 56) |
| `grep -c "'airTooSmall'" room-rules.js` | `1` (C9 on `master`) |
| `ls /home/foqcus/Documents/mushroom-farm-c8/proto-c9/rev3-bd24755/fixB-on-bd24755.diff` | Listed (the lead decision 56 change, for task 12) |
| `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail\|skipped)'` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `S0` (the prep 2.0 skips of every file) |

Read C3 and C2 completely before task 1.

## 3. Owned files (the only files you may touch; wave 2 plan section 3, Server 2 row)

| File | Action | Content |
|---|---|---|
| `room-rules.js` | Modify | C3 7.1 (read `ClimateCapacity.DESIGN_DAYS` at load, `ClimateEquipment` only at call time), 7.4, 7.6, 7.7 |
| `tests/room-rules.test.js` | Modify, append | Tasks 1–2 |
| `server/api.js` | Modify | C3 1, 2.1 (require order, `HttpError`, `opts.extraRoutes`), 3, 4, 4.1, 5, 6.8, 6.13, 6.20–6.26, 11 |
| `server/static.js` | Modify | C3 9: `/cycle.js`, `/equipment.js`, `/harvest-rules.js` |
| `tests/api.test.js` | Modify, append | Tasks 3–9; remove its prep 2.0 skips; the two stub files of C3 12.1 |
| `server/sim-adapter.js` | Modify | C2 1 (requires), 13.1 (`equipment`, `env.plant`) |
| `server/rooms.js` | Modify | C2 5.2, 5.3, 8.1, 12.2 |
| `tests/rooms.test.js` | Modify, append | Tasks 10–12; remove its prep 2.0 skips |

| Not yours | Owner |
|---|---|
| `server/main.js` | Lead at gate 2.5 (C10 8.4 wiring). You write only the two stub files `tmp/server/harvest-db.js` and `tmp/server/harvest-api.js` inside the `describe('server/main.js')` set-up of `tests/api.test.js` (C3 12.1). Not the `STUB_HARVEST_THROW` test: the lead adds it at gate 2.5 step 3b (before the wiring it would fail) |
| `server/api-common.js`, `harvest-rules.js`, `server/harvest-schema.js`, `tests/fakes/*`, `tests/fake-*.test.js`, the `equipment.js` stub, `index.html`, `web/api.js`, `docs/*` | Lead (prep 2.0) |
| `tests/stream.test.js`, `server/config.js`, `tests/config.test.js`, `server/db-common.js`, `server/rooms-common.js` | Nobody (read-only) |
| `server/db.js`, `tests/db.test.js` | Data 2 |
| `server/harvest-db.js`, `server/harvest-api.js` and their tests | Harvest data, Harvest API |
| `controller.js`, `sim.js`, `capacity.js`, `cycle.js`, `equipment.js` (the real one) | Equipment |

## 4. What you build against

### 4.1 C3 (`docs/contracts/api.md`)

| Section | What |
|---|---|
| 1 | Body size 8 MB for 6.21 only; 201 for a simulation run; `DELETE` known on 6.24 and on C10's extra routes; no 409 |
| 2.1 | `createApi` options with `extraRoutes` (default `[]`); the `ExtraRoute` table (match order, `needsRoom`, other path ids raw in `ctx.params`, `hasBody`, `run(ctx)`, fault handling, no stream event); `HttpError` from `server/api-common.js` (fields `status`, `error`, `details`; `api.js` has no class of its own); the module require table (`api.js` may require `./api-common.js`, never `./harvest-db.js`, `./harvest-api.js`, `./db.js`, `./rooms.js`) |
| 3.1 | Room has no `vent`; `Live` with `flush`, `blocks`, `air` (sent as C2 gives them) |
| 3.2 | Reading: exactly 18 keys in order, `air` and no `fan` |
| 3.6, 3.9–3.11 | Calibration with `source`, `log_from`, `log_to`, `equipment`; SimulationRunInfo, SimulationRun, `inputs` (3.10.1); Equipment field order |
| 4, 4.1, 4.2 | Error texts (`Invalid simulation run`, `Body is larger than 8 MB`, `Invalid equipment`, `Unknown simulation run`, the C10 7 texts by reference); check order, and the extra-route order (lead decision 64); mapping rows for `simulation`, `batch`, `crate`, `applySettings` on 6.26 (`bad_input` → 500); database errors stop the server |
| 5, 6.8, 6.13, 6.20–6.26 | Route table; readings range limits (`step` 3600–86400 allows 1300 days, lead decision 22); 6.13 body; the seven new routes |
| 7.1 | Load order. Node: `server/api.js` and `tests/room-rules.test.js` require `../sim.js`, `../air.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../capacity.js`, `../cycle.js`, `../equipment.js`, then `../room-rules.js`. `room-rules.js` reads `ClimateSim`, `ClimateController`, `ClimateCalib`, `ClimateCapacity.DESIGN_DAYS` at load, `ClimateEquipment` only inside `checkEquipmentBody`, `checkCalibration`, `checkSimulationRun`; loading it without `cycle.js` and `equipment.js` must not throw |
| 7.4, 7.6, 7.7 | `checkCalibration` extension; `checkSimulationRun` (with the `air` part of an equipment report, revision 9) and `checkRunPatch`; `checkEquipmentBody` (`<field>: missing` in field order, then `checkEquipment`'s problems unchanged) |
| 9 | Static list with `/cycle.js`, `/equipment.js`, `/harvest-rules.js` |
| 10.2 | No stream event for runs, equipment saves or harvest routes; a 6.26 save that changes `airM3h` emits what a settings save emits (C2 does it) |
| 11 | Every call, in order (6.20–6.26, the extra-route row) |
| 12, 12.1 | The `tests/api.test.js` and `tests/room-rules.test.js` rows (revisions 8, 9 and C10); the stub folder table rows `tmp/server/harvest-db.js` and `tmp/server/harvest-api.js` |

### 4.2 C2 (`docs/contracts/rooms.md`)

| Section | What |
|---|---|
| 1 | Requires: `server/rooms.js` loads `../air.js`, `../controller.js`, `../runtime.js`, `./sim-adapter.js`, `./rooms-common.js`; `server/sim-adapter.js` loads `../air.js`, `../sim.js`, `../runtime.js`, `../equipment.js`, in this order |
| 3, 12.2 | Factory `args` = `{ room, calib, blocks, equipment, cfg, snapshot, now }` |
| 4, "Not a manager method" | The Your machines save is C3's partial `applySettings`; C2 adds no function |
| 5.2 | `Live.flush`, `Live.blocks`, `Live.air` exact build rules (the 11 `air` keys, `today` from 00:00 farm time); none is part of the summary |
| 5.3 | ReadingRow 18 keys: `ac_fan` (the `sim.js` rule), `stage` (`cfg.stage`), `core` (finite or `null`) |
| 8.1 | Step 1 reads `db.getEquipment(id)`; step 3 passes `equipment`; "On error": the step 2 upgrade save is outside the steps 2–6 `try` (revision 9 change table, lead ruling 2026-10-09) |
| 9.1, row "Lowering CO₂ limit" | Lead decision 56: no Server 2 test may depend on `co2Lim`, `rules.fanOn`, `rules.fanOff` ramping after a lowering change |
| 13.1 | `env.plant = ClimateEquipment.plantOf(equipment, { volume: room.volume, calib })` when `equipment` is not `null`; `env.airM3h = cfg.airM3h` stays |
| 15, 16 | `getEquipment` in the call list; the fake manager (lead's, read-only) |
| 17 | The test rows of section 6 below |

### 4.3 Facts about the code on `master` (e60dabf)

| Place | Fact | What you do |
|---|---|---|
| `server/api.js` line ~19 | Its own `class HttpError` with the field `errorText`; `handleFault` answers `err.errorText` | Delete the class; `const { HttpError } = require('./api-common.js')`; `handleFault` answers `err.status`, `{ error: err.error, details: err.details }` |
| `server/api.js` `mapError` | Maps `NotFoundError` `settings`, `calibration`, else `Unknown room` | Add `simulation` → 404 `Unknown simulation run`, `batch` → 404 `Unknown batch`, `crate` → 404 `Unknown crate` (C3 4.1, C10 7) |
| `server/api.js` sub-id check | Every `:runId` that is not a positive integer gives `Unknown calibration run` | Per route: the calibration apply route keeps `Unknown calibration run`; the simulation routes (6.22–6.24) give `Unknown simulation run` (C3 4). A per-route field (for example `notFound` on the route row) is fine |
| `server/api.js` `readBody` | One `BODY_LIMIT` of 1 MB, message `Body is larger than 1 MB` | A limit per route: 8,388,608 bytes and `Body is larger than 8 MB` for 6.21, 1 MB elsewhere (lead decision 21) |
| `server/api.js` `ROUTES` | No `DELETE`, no routes after 6.19; `/api/stream` is the last row | Add 6.20–6.26 (6.24 is `DELETE`); match the extra routes after the C3 rows and before the stream |
| `server/api.js` requires | `../sim.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../room-rules.js` | The C3 7.1 order (adds `../air.js`, `../capacity.js`, `../cycle.js`, `../equipment.js`) |
| `server/static.js` shared list | `/controller.js`, `/sim.js`, `/air.js`, `/runtime.js`, `/capacity.js`, `/calib.js`, `/room-rules.js` | Add `/cycle.js`, `/equipment.js`, `/harvest-rules.js` |
| `server/rooms.js` `startLoopFromRow` (line ~286) | The `Upgraded: air exchange` `db.saveSettings` (line ~314) is inside the `try` of steps 2–6, so a db error there crashes the room | Move it out of the `try`: a db error is thrown to `start`, `create`, `restart` (C2 8.1) |
| `server/rooms.js` | No `getEquipment` read; `buildReadingRow` has 15 keys; `Live` has no `flush`, `blocks`, `air` | C2 8.1, 5.3, 5.2 |
| `server/sim-adapter.js` | Requires `../air.js`, `../sim.js`, `../runtime.js`; no `equipment` argument | Add `require('../equipment.js')` last; `env.plant` when `equipment` is not `null` (treat a left-out `equipment` as `null`) |
| `tests/api.test.js` static fixture | The temporary `root` holds `sim.js`, `air.js`, `room-rules.js`, … | Add `cycle.js`, `equipment.js`, `harvest-rules.js` fixture files for the static tests |
| `tests/rooms.test.js` line ~80 | "sim adapter: requires air.js before sim.js (C9 section 6.3)" checks the children `air.js`, `sim.js`, `runtime.js` | Becomes the four names (task 10) |

## 5. Test helpers

| Item | Value |
|---|---|
| `tests/api.test.js` | Keep `startApi(extra)`, `seedRoom`, `reading(t)` (18 keys after prep 2.0), `rawGet`, `dbErr(errcode)`, `withReplaced(obj, method, impl, fn)`, `buildMainTmp`, `spawnMain`, `freePort`. Extend `startApi` so it passes `extraRoutes` through when given |
| Extra test route (C3 12, C10 row) | Made in the test file, never C10's: for example `{ method: 'POST', segs: ['api', 'rooms', ':id', 'probe', ':thing'], needsRoom: true, hasBody: true, run: ctx => { seen.push(ctx); return { status: 201, body: { ok: true } }; } }` and a `DELETE` row `['api', 'probes', ':probeId']`; segment names never `:versionId`, `:runId`, `:alarmKey` |
| Hand-made cycle Result | `{ verdict: 'ok', totals: { days: 1, pass: true, kwh: 10, rm: 5.7, rmPerBlock: 0.003 }, stages: [{ stage: 'fruiting' }], series: Array.from({ length: 24 }, (_, h) => ({ h })) }` (passes C3 7.6) |
| Hand-made equipment Report | `{ verdict: 'ok', ac: { verdict: 'too-small' }, air: { verdict: 'enough', own: 1800, capS: 180, needM3h: 800, recommended: null, margin: null, purgeS: 69, stage: 'pinning', text: 'Your 1,800 m³/h air exchange is enough: a purge takes at most 1.2 min (pinning), the limit is 3 min.' }, runs: [{ kind: 'ac', ac_hp: 1 }], summary: ['x'] }` |
| Inputs | `{ mix: [{ crop: 'oyster', blocks: 2000, co2_per_block: null }], settings: CC.defaultSettings(), region: 'my-lowland', tariff: 0.57, volume: 60, calibration: null, empty_below: null, equipment: null }`; kind `equipment` needs `equipment` = `{ ...ClimateEquipment.DEFAULTS }` |
| `tests/rooms.test.js` | Keep `setup(adapterFactory)`, `scripted()`, `simSpyFactory()`, `capture(factory)`, `T0` |
| Stub probe (C2 17) | `let STUB = false; try { ClimateEquipment.plantOf(ClimateEquipment.DEFAULTS, { volume: 60, calib: null }); } catch (e) { STUB = e.message === 'stub'; }` (after `require('../equipment.js')`) |
| Skip of "Room equipment" | `test('Room equipment', { skip: STUB && "plantOf throws 'stub' (prep 2.0 stub of equipment.js); runs at gate 2.5" }, fn)`, the reason text exactly as C2 17 |
| `ClimateSim.create` spy | As the `master` test "sim adapter: env": keep `orig`, replace with `(env, snap) => { seen.push(env); return orig(env, snap); }`, restore in `t.after` |
| Fatal db error | `Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 })`; constraint: `errcode: 275` (C1 9.2) |
| Error checks | `assert.equal(status, …)` and `body.error`; `details` only where the contract fixes the text (for example `air_m3h: missing`, `fan_m3h: unknown field`, `vent: unknown field`) |

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, implement, see it pass, commit)

| Rule | Detail |
|---|---|
| Order | Task 0, then 1–13. Commit after each task that ends green |
| Run one file | `node --disable-warning=ExperimentalWarning --test tests/<file>.test.js` |
| Test names | New tests take the names in the table (exact). Tests that exist on `master` keep their names unless the table says otherwise |
| Contract labels | C2 17 rows are named by their "Proves" label where the test is new; where `master` already has the row under another name, the table says which test it is |

| # | Test(s) first (exact names) | Then build | Proves |
|---|---|---|---|
| 0 | – | Section 2 checks. No commit | Start state |
| 1 | `tests/room-rules.test.js`: change the requires to the C3 7.1 Node order (`../sim.js`, `../air.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../capacity.js`, `../cycle.js`, `../equipment.js`, `../room-rules.js`). **`room-rules: loads without cycle.js and equipment.js (C3 7.1)`**: a child process (`spawnSync(process.execPath, ['-e', …])`) requires `sim.js`, `air.js`, `controller.js`, `runtime.js`, `calib.js`, `capacity.js`, then `room-rules.js`; exit 0 and `typeof ClimateRoomRules.checkEquipmentBody === 'function'`. Rename **`Object.keys sorted equals the 10 names`** to **`Object.keys sorted equals the 13 names`** (adds `checkEquipmentBody`, `checkRunPatch`, `checkSimulationRun`). **`checkEquipmentBody (C3 7.7)`**: a valid body (`{ ...ClimateEquipment.DEFAULTS }`) gives `[]`; `null` gives `['equipment: must be an object']`; left-out `height` gives a problem `height: missing`; `fan_m3h` in place of `air_m3h` gives `air_m3h: missing` and `fan_m3h: unknown field`; `air_m3h` 40 and 10001 give `air_m3h: must be a number from 50 to 10000`, 50 and 10000 give `[]`; one body per `checkEquipment` problem of C8 4.3 gives that text. **`checkCalibration: source, log_from, log_to, equipment (C3 7.4)`**: `source` `null`, `csv`, `history`, `import` accepted, `web` a problem; `source: 'history'` without `log_from` a problem; `log_from` without `log_to` a problem; `log_from > log_to` a problem; `log_to` above `now + 60` a problem; a valid `equipment` accepted, an `equipment` failing `checkEquipmentBody` a problem | `room-rules.js`: read `ClimateCapacity.DESIGN_DAYS` at load; `checkEquipmentBody`; the `checkCalibration` rows of C3 7.4; read `global.ClimateEquipment` inside the functions only | C3 7.1, 7.4, 7.7 |
| 2 | **`checkSimulationRun: valid runs (C3 7.6)`**: a passing cycle, a failing cycle (`totals.pass: false`), an impossible cycle (`{ verdict: 'impossible', why: 'x' }`), a capacity report, an equipment Report and an impossible equipment run give `[]`. **`checkSimulationRun: each broken rule (C3 7.6)`**: one body per rule, each a problem: not an object; an extra body key; `kind: 'heat'`; an `inputs` key missing; `inputs.vent`; `inputs.mix` failing `checkMix`; `inputs.region: 'mars'`; `inputs.tariff: 11`; `inputs.volume: 4`; `inputs.calibration` with an extra key `rmse_t` gives `inputs.calibration.rmse_t: unknown field`; `inputs.calibration.id: 0`; `empty_below: null` for `capacity`; `empty_below: 5` for `cycle`; `inputs.equipment: null` for kind `equipment`; a cycle `series` of the wrong length; `series[3].h === 2`; `totals.days: 0`; capacity `result.verdict: 'pass'`; equipment `result.ac.verdict: 'pass'`; note of 201 characters. **`checkSimulationRun: the air part of an equipment report (C3 7.6, revision 9)`**: `air` missing, `air.verdict: 'fine'`, `air.own: null`, `air.stage: 'harvest'`, `air.text: ''` each a problem; `air.needM3h: null` and `air.recommended: null` accepted; every verdict `enough`, `too-small`, `not-the-fix`, `oversized` accepted. **`checkRunPatch (C3 7.6)`**: `{}` a problem; `{ note: null }`, `{ real_start: null }` and `{ real_start: now + 366 × 86400 }` accepted; `real_start` 0, 1.5 and `now + 366 × 86400 + 1` problems; an extra key a problem | `checkSimulationRun`, `checkRunPatch` | C3 7.6 |
| 3 | `tests/api.test.js`. **`HttpError comes from server/api-common.js (C3 2.1)`**: `require('../server/api.js')` loads; the source text of `server/api.js` has no `class HttpError` and no `errorText` (read with `fs`); an extra route (task 7 helper, or a temporary one here) that throws `new (require('../server/api-common.js').HttpError)(400, 'Invalid thing', ['x: bad'])` answers 400 `{ error: 'Invalid thing', details: ['x: bad'] }`. **`error mapping: NotFoundError simulation, batch, crate (C3 4.1)`**: `db.getSimulationRun` replaced with a thrower of `new NotFoundError('simulation', 5)` gives 404 `Unknown simulation run`; an extra route whose `run` throws `NotFoundError('batch', 7)` gives 404 `Unknown batch`, `NotFoundError('crate', 9)` 404 `Unknown crate`. Extend **`known shared modules and web files give 200 with the right content type`** with `/cycle.js`, `/equipment.js`, `/harvest-rules.js` (fixture files added to the temporary `root`) | The C3 7.1 require order in `api.js`; delete `api.js`'s `HttpError`, require it from `./api-common.js`, answer `err.error`; `mapError` rows; `static.js` list | C3 2.1, 4.1, 9; C10 7, 8.1 |
| 4 | Remove every prep 2.0 skip of `tests/api.test.js` (if any; section 2) by rewriting those tests to the C1 revision 6 / C2 revision 9 fakes. **`readings: 18 keys in order, air and no fan (C3 3.2)`**: a stored reading comes back from `/readings` with `Object.keys` exactly the 18 keys of C3 3.2 in order. **`rooms: no vent; vent gives Invalid room (C3 3.1, 7.2)`**: `GET /api/rooms` rooms have no `vent`; `POST /api/rooms` and `PATCH /api/rooms/:id` with `vent` give 400 `Invalid room` with `vent: unknown field` and no C2 call. **`rooms: live relays flush, blocks and air (C3 3.1)`**: the fake's default `live` has `flush`, `blocks`, `air` `null`; after `setLive(id, { flush: 2, blocks: 500, air: { on: true, state: 'purge', … } })` `GET /api/rooms` gives them unchanged. **`readings range: step 3600 over 400 days, step 600 over 40 days (C3 6.8)`**: the first 200, the second 400 `Invalid query`; `step` 3600 over 1301 days 400. **`POST /calibrations: source, log_from, log_to, equipment (C3 6.13)`**: `source: 'history'` without `log_from` 400 `Invalid calibration`, nothing stored; with `log_from`, `log_to` and a valid `equipment` 201, and `GET /calibrations` gives them back (`equipment` with `air_m3h`) | 6.8 range rule for `step` ≥ 3600; 6.13 passes the new fields to `db.saveCalibration` | C3 3.1, 3.2, 6.8, 6.13 |
| 5 | **`simulation runs: create, list, get, patch, delete (C3 6.20-6.24)`**: 6.21 with a cycle run gives 201 SimulationRunInfo without `result` (`verdict` `pass`, `blocks` 2000, `days` 1); `note: '  x  '` stored `x`, `'  '` stored `null`; 6.20 lists newest first, `limit` and `before` page; 6.22 gives `result`; 6.23 `{ note, real_start }` gives 200 without `result`; 6.24 `DELETE` gives the deleted SimulationRunInfo, then 6.22 gives 404. **`simulation runs: 400s and 404s (C3 6.20-6.24, 7.6)`**: one 400 `Invalid simulation run` per route body with nothing stored; 6.20 `limit=0` and `limit=201` 400 `Invalid query`; 404 `Unknown simulation run` for `:runId` `0`, `abc`, an unknown id and another room's run (on 6.22, 6.23, 6.24); 404 `Unknown room` for an archived room. **`simulation runs: body limits 8 MB on 6.21, 1 MB on 6.23`**: a 7 MB body on 6.21 is accepted (201), a 9 MB body gives 400 `Body is larger than 8 MB` with nothing stored; a 2 MB body on 6.23 gives 400 `Body is larger than 1 MB`. **`simulation runs: an equipment Report (C3 6.21)`**: kind `equipment` with the hand-made Report gives 201 and `verdict` `too-small`. **`DELETE on another path gives Unknown route`**: `DELETE /api/rooms/1`, `DELETE /api/rooms/1/settings` give 404 `Unknown route` | 6.20–6.24, the 8 MB limit, `DELETE` in the route table, the per-route `:runId` text | C3 1, 6.20–6.24, 11 |
| 6 | **`equipment: GET null then the saved row; PUT stores (C3 6.25, 6.26)`**: 6.25 gives `null`; 6.26 with the 7 fields gives 200 Equipment in C3 3.11 field order; 6.25 then gives the row. **`equipment: an air_m3h that differs syncs the settings airM3h (lead decision 35)`**: `air_m3h: 900` against the default 1800: the fake's `calls` hold exactly one `applySettings` with `args` deep-equal `[id, { airM3h: 900 }, 'Air exchange size from Your machines']` and `args.length === 3`; the reply is the Equipment; `GET /settings` gives `airM3h` 900. **`equipment: the same air_m3h makes no applySettings call`**: a second `PUT` with 900 makes no `applySettings` call and stores no settings version. **`equipment: 400 Invalid equipment, nothing stored (C3 7.7)`**: `fan_m3h` in place of `air_m3h` gives 400 with `air_m3h: missing` and `fan_m3h: unknown field`; `ac_hp: 1.25`, a non-object body; after each, 6.25 still `null` and no `applySettings` call | 6.25, 6.26 (C3 11 call order) | C3 6.25, 6.26, 7.7; lead decision 35 |
| 7 | `describe('extra routes (C3 2.1, C10 13)')`: **`needsRoom: run gets ctx.id after the room check; not called for an unknown or archived room`**; **`hasBody: ctx.body parsed with the __proto__ reviver`** (`{"__proto__":{"polluted":1},"a":1}` gives `ctx.body` `{ a: 1 }`, `({}).polluted` `undefined`); **`hasBody: over 1 MB and bad JSON answer 400 without calling run`**; **`ctx.params holds raw segments; ctx.query is the URLSearchParams`** (`:thing` = `a%20b` stays `a%20b`; `?x=1` gives `ctx.query.get('x') === '1'`; `ctx.id` `undefined` on a route without `needsRoom`; `ctx.body` `undefined` without `hasBody`); **`run's { status, body } is the reply`** (status 201, JSON reply headers of C3 1); **`an HttpError from server/api-common.js is answered with status, error, details`**; **`a constraint error gives 500 and no onFatal; a non-constraint sqlite error 500 and onFatal once`**; **`a DELETE extra route answers`**; **`a C3 route wins over an extra route with the same method and path`** (an extra `GET ['api', 'rooms']` is never called); **`extra routes come before /api/stream`** (an extra `GET ['api', 'stream']` is not reached: the C3 stream still answers; a non-matching extra path gives `Unknown route`). The whole existing suite runs without `extraRoutes` (default `[]`) | `opts.extraRoutes`: matched after the C3 rows and before `/api/stream`; room check only with `needsRoom`; `:id` is the only path id `createApi` checks for an extra route; body read only with `hasBody`; `run` synchronous; faults through `handleFault` | C3 2.1, 4, 4.2, 12 (C10 row); lead decisions 62, 64 |
| 8 | In `buildMainTmp` (`describe('server/main.js')`) write the two stub files of C3 12.1: `tmp/server/harvest-db.js` (`openHarvest(db)` prints `stub: openHarvest`; throws `Error('stub cannot open harvest')` when `STUB_HARVEST_THROW` is set; otherwise returns `openFakeHarvest(db)` by an absolute `require` of the worktree's `tests/fakes/harvest-db.js`) and `tmp/server/harvest-api.js` (`createHarvestRoutes()` returns `[]`). **`the stub folder holds harvest-db.js and harvest-api.js (C3 12.1)`**: in a child process (absolute requires of the two tmp files and the worktree's `tests/fakes/db.js`), `openHarvest(openFakeDb())` prints `stub: openHarvest` and returns an object with `createBatch`; with `STUB_HARVEST_THROW=1` it throws `stub cannot open harvest`; `createHarvestRoutes()` is `[]`. Every existing `server/main.js` test still passes (`main.js` does not load the stubs until the lead wires it). Not the `STUB_HARVEST_THROW` start test | Only test code | C3 12.1 rows |
| 9 | `tests/rooms.test.js`, adapter part. Update **`sim adapter: requires air.js before sim.js (C9 section 6.3)`** (the C2 17 row "Requires and target keys"): the children are `air.js`, `sim.js`, `runtime.js`, `equipment.js`, in this order; `rooms: TARGET_KEYS follow the controller ramp keys (C9 section 6.3)` stays. **`Equipment stub probe`**: when `STUB` is true, `plantOf` throws an `Error` with message `stub`; when false, `plantOf(DEFAULTS, { volume: 60, calib: null })` is an object with an `ac` key. **`Room equipment`** (C2 17 row, exact; skipped while `STUB`, lead decision 48): saved equipment `{ ac_hp: 3, ac_units: 1, fog_lph: 6, air_m3h: 600, walls: 'pu50', roof: 'pu50', height: 3 }`; the factory gets it as `equipment`; through the `ClimateSim.create` spy: `plant.ac.capW === 7910`, `plant.room.ua` ≈ 28.12; with an applied calibration no `plant.room`; without equipment `plant` `undefined`; in each case `airM3h` is the settings' 1800, not 600. The existing **`sim adapter: env`** and **`sim adapter: the simulated room runs with its own air exchange size (C9 section 6.3)`** (the C2 17 row "Air exchange size") keep passing with `equipment` left out | `sim-adapter.js`: `require('../equipment.js')` after `../runtime.js`; `env.plant = ClimateEquipment.plantOf(equipment, { volume: room.volume, calib })` when `equipment` is given and not `null` (C2 13.1); nothing else in the env changes | C2 1, 13.1, 17; lead decision 48 |
| 10 | Remove every prep 2.0 skip of `tests/rooms.test.js` ("Recording", "One reading shape" per the plan; your section 2 list) by rewriting them: **`Recording`** checks exactly the 18 keys (C2 17 row "Recording": `air` 0 or 1, `ac_fan` `null` while the AC is off and one of `low`, `auto`, `high` while it runs, `stage` equal to `get(id).live.stage`, `core` a number, the payload row deep-equal to `db.latestReading`); **`One reading shape`**: a manager started on a db with a reading of the last hour gives `live.reading` the same keys as a Record row. **`Room equipment: the adapter factory gets the saved row`** (runs now, needs no `plantOf`): with `capture(scripted().factory)`, a room with saved equipment gives `made.at(-1).equipment` deep-equal to `db.getEquipment(id)`; without equipment `null`. The existing **`Block count`** and **`Recording: air is 1 while cmd.air.on, else 0 (C9 section 6.3)`** (C2 17 row "Air exchange row") keep passing | `rooms.js`: loop start reads `db.getEquipment(id)` (step 1) and passes `equipment` (step 3); `buildReadingRow` adds `ac_fan`, `stage`, `core` (C2 5.3) | C2 5.3, 8.1, 12.2, 17 |
| 11 | **`Live flush and blocks`**: mix sum 500 gives `live.blocks === 500`, no mix `null`; `live.flush` is 1 after start and follows an automatic `rest` → `fruiting` change (assert only `flush` and `stage`, no CO₂ key); a change of only `flush` or `blocks` emits no `room`. **`Live air exchange`**: after the first reading with default settings `live.air` has exactly the 11 keys of C2 5.2, `state` one of `idle`, `purge`, `after`; with `manual.air = { auto: false, on: true }` (through `applySettings`), after the next reading `on`, `manual`, `manualOn` are `true` and `reason` is `'manual'`; `today` has `purges` (integer ≥ 0), `avgS` (`null` when `purges` is 0), `capped`; a run held above `rules.fanOn` with the scripted adapter gives `today.purges ≥ 1`; a change of `live.air` alone emits no `room`. **`Upgrade save error`**: a stored version 1 settings object (with `manual.fan = { auto: false, level: 2 }`) and the fake db's `saveSettings` replaced by a thrower of the fatal shape: `start()` throws that error; and on a second manager whose room started normally, `db.saveSettings(id, { settings: <a version 1 object> })` written straight to the fake, then `saveSettings` replaced by the thrower, `restart(id)` throws it (`create` stores upgraded settings, so it never reaches this save: test `start` and `restart` only); the room is not marked crashed (`live.error` is not the error message; no `Stopped by an error` event). It fails on `master` (the save is inside the `try`) | `Live.flush`, `Live.blocks`, `Live.air` (C2 5.2 build rules, after each Record and at loop start); move the `Upgraded: air exchange` save out of the steps 2–6 `try` | C2 5.2, 7, 8.1, 17 |
| 12 | Lead decision 56 audit (C2 9.1). Read every test of `tests/rooms.test.js` and `tests/api.test.js` that changes the stage, crop or farm type ("Settings rules", "Automatic stage version", "Crop and farm type", "Restore exact", "Room summary", "Pair correction, high key", "Resume: …", your task 11 tests): no assertion may depend on `co2Lim`, `rules.fanOn` or `rules.fanOff` ramping after a change that lowers the CO₂ limit (compare live values with live values, or assert only T, RH and `rules.co2SafetyAt` on a lowering change; a raising change still ramps). The C2 17 row "Pair correction" is the high-key test only; the low-key test stays dropped. Proof: the scratch run of section 7 | Only test changes where the audit finds a dependence | Lead decision 56; C2 9.1, 17 |
| 13 | – | Section 7; commit; report (section 10) | – |

| Point | Rule |
|---|---|
| C2 17 rows already on `master` under other names | "Air exchange row" = `Recording: air is 1 while cmd.air.on, else 0 (C9 section 6.3)`; "Settings upgrade" = the seven `Settings upgrade: …` tests; "No vent" = `create ignores vent (C9 section 6.3)` plus the `update` checks in `update` and `Errors`; "Air exchange size" = `sim adapter: the simulated room runs with its own air exchange size (C9 section 6.3)`; "Requires and target keys" = `sim adapter: requires air.js before sim.js (C9 section 6.3)` (updated in task 9) and `rooms: TARGET_KEYS follow the controller ramp keys (C9 section 6.3)`; "Pair correction" = `Pair correction, high key`. Keep them passing; do not rename |
| C2 17 rows new in this stream | `Upgrade save error`, `Equipment stub probe`, `Live flush and blocks`, `Live air exchange`, `Room equipment` |
| Do not assert | The fake's emits that only the real manager makes (C3 12 rule); exact purge times or counts beyond "≥ 1"; error message texts of node:sqlite; `co2Lim`, `rules.fanOn`, `rules.fanOff` mid-ramp after a lowering change |

## 7. How to verify

| Command (from `<worktree>`) | Expected |
|---|---|
| `node --disable-warning=ExperimentalWarning --test tests/room-rules.test.js tests/api.test.js tests/rooms.test.js` | `# fail 0`; `# skipped 1` (`Room equipment`, with the C2 17 reason) |
| `npm test 2>&1 \| grep -E '^# (pass\|fail\|skipped)'` | `# fail 0`; `# skipped` = `S0 − P + 1` (your `P` prep skips gone, `Room equipment` added); `# pass` = `N0 + P + <your new test count>` (write both numbers in the report) |
| `grep -c "C1 rev 6 / C2 rev 9 fake:" tests/rooms.test.js tests/api.test.js` | `0` for both |
| `T=$(mktemp -d); git archive HEAD \| tar -x -C $T; (cd $T && patch -p1 -s < /home/foqcus/Documents/mushroom-farm-c8/proto-c9/rev3-bd24755/fixB-on-bd24755.diff && node --disable-warning=ExperimentalWarning --test tests/rooms.test.js tests/api.test.js tests/room-rules.test.js 2>&1 \| grep -E '^# (pass\|fail)'); rm -rf $T` | `# fail 0` (lead decision 56 in place; measured on `master` e60dabf: only the low-key "Pair correction" failed there, and prep 2.0 dropped it) |
| `grep -c "class HttpError\|errorText" server/api.js` | `0` |
| `grep -n "require(" server/api.js` | `./static.js`, `./api-common.js`, then `../sim.js`, `../air.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../capacity.js`, `../cycle.js`, `../equipment.js`, `../room-rules.js` (optionally `./db-common.js`, `./rooms-common.js`); no `./db.js`, `./rooms.js`, `./harvest-db.js`, `./harvest-api.js` |
| `grep -n "require(" server/sim-adapter.js server/rooms.js` | `sim-adapter.js`: `../air.js`, `../sim.js`, `../runtime.js`, `../equipment.js`; `rooms.js`: `../air.js`, `../controller.js`, `../runtime.js`, `./sim-adapter.js`, `./rooms-common.js` |
| `node -e "for (const f of ['sim','air','controller','runtime','calib','capacity']) require('./'+f+'.js'); require('./room-rules.js'); console.log(Object.keys(ClimateRoomRules).length)"` | `13` (loads without `cycle.js` and `equipment.js`) |
| `git diff --name-only $(git merge-base HEAD master) HEAD` | Only the 8 files of section 3 |
| `git diff --exit-code $(git merge-base HEAD master) HEAD -- tests/vectors/ server/main.js server/api-common.js tests/fakes/ equipment.js controller.js` | No output, exit 0 |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git branch --show-current`; `git status --short` | `stream/server-2`; empty |

## 8. Done when

| # | Item |
|---|---|
| 1 | Routes 6.20–6.26 (6.26 with the `airM3h` settings sync, lead decision 35), the 6.8 and 6.13 changes, `/cycle.js`, `/equipment.js`, `/harvest-rules.js` pass against the fakes (C3 12) |
| 2 | Readings and `live.reading` have the 18 keys with `air`; Rooms have no `vent`; `live.flush`, `live.blocks`, `live.air` are built by C2 5.2 and relayed by C3 3.1 (lead decision 27) |
| 3 | `env.plant` reaches the simulated room when the room has machines (C2 13.1); the factory gets `equipment` |
| 4 | The `Upgraded: air exchange` save of `startLoopFromRow` is outside the steps 2–6 `try`; "Upgrade save error" passes |
| 5 | `room-rules.js` has `checkSimulationRun`, `checkRunPatch`, `checkEquipmentBody`, the extended `checkCalibration`, and loads without `equipment.js` and `cycle.js` (C3 7.1) |
| 6 | `createApi(opts.extraRoutes)` and `HttpError` from `server/api-common.js` (field `error`) pass every item of the C3 12 C10 row; `DELETE` works on 6.24 and on extra routes; `mapError` maps `simulation`, `batch`, `crate` |
| 7 | The two stub files of C3 12.1 are written by the `server/main.js` test set-up; every `server/main.js` test passes; no `STUB_HARVEST_THROW` test |
| 8 | "Room equipment" is skipped with the exact C2 17 reason while `plantOf` throws `stub` (lead decision 48) and runs at gate 2.5 without an edit |
| 9 | No prep 2.0 skip left in `tests/rooms.test.js` and `tests/api.test.js`; no test depends on `co2Lim`, `rules.fanOn` or `rules.fanOff` ramping after a lowering change (lead decision 56); the scratch run with `fixB` gives `# fail 0` |
| 10 | Every command of section 7 gives its expected result; committed on `stream/server-2` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit `server/main.js`, or add the `STUB_HARVEST_THROW` test | The lead wires `main.js` and adds that test at gate 2.5 step 3b (C3 12.1, C10 8.4) |
| Change the fakes, `server/api-common.js`, `harvest-rules.js`, the `equipment.js` stub, `controller.js`, `index.html`, `docs/` | Other owners (section 3); report what you need |
| Keep a `HttpError` class or an `errorText` field in `server/api.js` | One class for both files, so `instanceof` holds for a throw from `server/harvest-api.js` (C3 2.1, lead decision 62) |
| Require `./harvest-db.js`, `./harvest-api.js`, `./db.js` or `./rooms.js` from `server/api.js`, or mount C10's routes yourself | They come in through `opts` (C3 2.1) |
| Test C10's routes or their rules | Harvest API's `tests/harvest-api.test.js` (C3 12); you test `extraRoutes` with your own test route |
| Check `:batchId` / `:crateId` in `createApi` | `run` checks its own ids after the body (lead decision 64) |
| Read `ClimateEquipment` at load in `room-rules.js` | It must load without `equipment.js` (C3 7.1) |
| Write a test that depends on `co2Lim`, `rules.fanOn` or `rules.fanOff` ramping after a lowering change, or bring back the low-key "Pair correction" test | Lead decision 56; C2 9.1, 17 |
| Unskip "Room equipment" by hand, or skip it with another reason | It switches itself on at gate 2.5 (lead decision 48) |
| Weaken, skip or `todo` a test so it passes on the fake | Report the difference instead |
| Run `npm run vectors` or `tools/make-vectors.js` | They rewrite `tests/vectors/` |
| Write report or summary files | The report is your last message |

## 10. Report to the lead (your final message)

| Item | Content |
|---|---|
| Commits | `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Counts | `N0`, `S0`, `P` and the prep skips you removed; `# pass` and `# skipped` at the end |
| Section 7 | The result of each command, the `fixB` scratch run's last lines included |
| Lead decision 56 audit | Each test you changed for it, and why |
| Contract questions | Every gap or difference with its C2 / C3 / C10 section |

## 11. Change log

| Revision | Date | Changes |
|---|---|---|
| 0 | 2026-10-09 | First brief, from the frozen C2 revision 9, C3/C4 revision 9, C1 revision 6, C9 revision 2 (6.3), C10 revision 2 and the wave 2 plan (Server 2 row, prep 2.0 step 6) |
| 1 | 2026-10-09 | The prep 2.0 skips as step 2b made them: "Recording" and "One reading shape" in `tests/rooms.test.js`, none in `tests/api.test.js`, the reason text, `P` = 2 |

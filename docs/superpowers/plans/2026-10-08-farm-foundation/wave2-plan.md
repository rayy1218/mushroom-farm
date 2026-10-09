# Wave 2 plan: room-centred app and the equipment check

Date: 2026-10-08, revised 2026-10-09 for the C9 air exchange. Status: **draft** (revision 2, not frozen; the lead freezes it with the contracts, lead decision 31). Changes only through the lead. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md` (section 6). Repo: `mushroom-farm` (plain JavaScript, CommonJS, no build step, no npm dependencies, Node.js 22.13 or newer; this machine has 22.20).

| Binding source, in this order | Path |
|---|---|
| Lead decisions 1–68 | `docs/contracts/LEAD-DECISIONS.md` |
| C9 revision 1 (air exchange, frozen, on `master`) and its revision 2 amendment (wave 2: the CO₂ limit at a stage change, lead decision 56; the C8 oversized air verdict, lead decision 58) | `docs/contracts/air.md` |
| C1 revision 6 (database) | `docs/contracts/db.md` |
| C2 revision 9 (room manager) | `docs/contracts/rooms.md` |
| C3 and C4 revision 9 (HTTP API, live feed) | `docs/contracts/api.md` |
| C5 and C6 revision 8 (web modules, settings editor) | `docs/contracts/web.md` |
| C7 revision 3 (crop cycle) | `docs/contracts/cycle.md` |
| C8 revision 3 (equipment check) | `docs/contracts/equipment.md` |
| C10 revision 2 (batches and harvest by room QR; owner decision 2026-10-09, lead decisions 59–68) | `docs/contracts/harvest.md`; spec `docs/superpowers/specs/2026-10-09-harvest-qr-design.md`; code of the lead's tasks `docs/superpowers/plans/2026-10-09-harvest-qr/README.md` |
| This plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` |

### Changes in revision 2

| Section | Change |
|---|---|
| Header, 1 | Built on `master` bd24755 (C9 air exchange merged, the 600 ppm stop-level floor and the ramped-limit CO₂ scoring of d0cf07d; 672 tests); the binding contracts are C1 6, C2 9, C3 9, C5 8, C7 3, C8 3 and C9 1. The drawing fix is done (section 7). |
| 2 | Prep 2.0 writes `index.html` (finding 2); the fakes are C1 revision 6 (version 3, the `air` key) and C2 revision 9; the fake API server serves `/air.js`, `/cycle.js`, `/equipment.js` (findings 3, 19); the tests that fail against the new fakes get listed skips (findings 1, 11); the `equipment.js` stub has `AIR_SIZES`. |
| 3, 3.1 | Upgrade 3; owners of the files C9 changed; Room shell no longer owns `index.html`; the prep skips are removed by their owners. |
| 5 | Step 0 makes a version 1 and a version 2 database file (finding 25); upgrade 3 checked from both; 10 vector tests. |
| 6.2, 7 | `mimicLayout({ inletAt, exhaustAt })` is on `master` (C9); the drawing section records the fix as done. |
| 8 | Equipment brief edits for C8 revision 3, C9 revision 2 and findings 20, 21 (applied: the brief is committed as `equipment.md` revision 3, buildability check B1); the Bench note of finding 14. |
| 10 (new) | How each freeze-check finding (27) was resolved. |
| 11 (new) | The items the lead and the owner decided (lead decisions 56–58). |
| 1, 2, 3, 3.1, 5, 6 (C10 fold) | C10 (lead decisions 59–68): prep 2.0 step 5b (the lead's harvest files, harvest plan tasks 0.2–0.5), `index.html` with the harvest lines, three more streams (Harvest data, Harvest API, Harvest web), C10 rows for Data 2, Server 2, Room shell and Docs, gate 2.5 merges the two harvest server streams and wires `server/main.js`, wave 3 adds `tests/api-real.test.js` coverage of C10 9 and the real-phone scan check. |

## 1. Overview

| Phase | Who | What | Starts when |
|---|---|---|---|
| 2.0 | Lead | Prep: the frozen contracts on `master`, the fakes, the client calls, `index.html`, the tab registry and stubs, the `equipment.js` stub, the briefs (section 2) | `master` bd24755 is green (672 tests) |
| 2 | Twelve streams, in parallel, each in its own worktree | Data 2, Equipment, Server 2, Room shell, Live tab, Simulate tab, Calibrate tab, Bench, Docs, Harvest data, Harvest API, Harvest web (section 3) | Prep 2.0 is on `master` and green |
| 2.5 | Lead | Gate: merge Data 2, Equipment, Server 2, then Harvest data and Harvest API; wire `server/main.js` (C10 8.4); run the real server on a version 1 and a version 2 database file (section 5) | Those five streams are reviewed |
| 2 (after 2.5) | The web streams and Equipment | Their headless Chrome checks against the real server on the gate 2.5 `master` (C5 7.10) | Gate 2.5 passes |
| 3 | Lead | Integration: merge in order, clean up, every test and check again (section 6) | Every stream is reviewed |
| Done before wave 2 | Another developer, then C9 | The room drawing fix (merged on `master`, 4849b67) and its C9 rewrite (section 7) | – |

## 2. Prep 2.0 (lead, before any stream)

| Step | Files | Done when |
|---|---|---|
| 1. Freeze the contracts | `docs/contracts/db.md` (C1 rev 6), `rooms.md` (C2 rev 9), `api.md` (C3 rev 9), `web.md` (C5 rev 8), `cycle.md` (C7 rev 3), `equipment.md` (C8 rev 3), `air.md` (C9 rev 2), `harvest.md` (C10 rev 2), `LEAD-DECISIONS.md` (14–54, 56–68), the spec, the harvest spec `docs/superpowers/specs/2026-10-09-harvest-qr-design.md`, the harvest plan `docs/superpowers/plans/2026-10-09-harvest-qr/README.md`, this plan, `docs/research/2026-10-08-lionsmane-research.md`, `docs/research/2026-10-08-equipment-facts.md` | Committed on `master` (one commit, plain message); `npm test` still green (documents only) |
| 2. Fakes | `tests/fakes/db.js`, `tests/fakes/rooms.js`, `tests/fakes/api-server.js`, `tests/fake-db.test.js`, `tests/fake-rooms.test.js`, `tests/fake-api-server.test.js` | The fake db follows C1 9 (version 3, the seven new functions, the 18 Reading keys with `air`, the new Calibration fields, `air_m3h`, the 275/3091/1299 lists); the fake room manager follows C2 16 (`flush: null`, `blocks: null`, `air: null`); the fake API server follows C5 4.5 (`/simulations` → `[]`, `GET …/equipment` → `null`, `DELETE` → `{}`) and serves `/air.js`, `/cycle.js` and `/equipment.js` as C3 9 (`master` lacks `/air.js` there), tested in `tests/fake-api-server.test.js` (200, `text/javascript; charset=utf-8`, the file bytes); the new fake behaviour is tested in `tests/fake-db.test.js` and `tests/fake-rooms.test.js` |
| 2b. Skips for the new fakes (findings 1, 11) | `tests/db.test.js` (fake runs only), `tests/rooms.test.js`, `tests/api.test.js`: skips only, plus one key list | After step 2, run `npm test`. In the same commit, add `{ skip: 'C1 rev 6 / C2 rev 9 fake: <Data 2 \| Server 2> rewrites this test' }` to exactly the tests that fail (measured on bd24755 by the buildability check: `tests/db.test.js` "fake: open gives path and version", "fake: insertReading: round trip, T <-> temp", "fake: saveCalibration: defaults" — `both()` runs real and fake in one helper, so the skip may take a one-line change to `both()` or a separate fake-only `test(…, { skip })`; `tests/rooms.test.js` "Recording", "One reading shape"; `tests/api.test.js` "readings default" needs no skip, the 18-key edit fixes it; the 4 failing `tests/fake-db.test.js` / `tests/fake-rooms.test.js` tests are the lead's own and are fixed in step 2). Change the `tests/api.test.js` Reading key list to the 18 keys (the API relays the fake, so it passes). Drop the C2 "Pair correction" test of `tests/rooms.test.js` (the low key, a golden pinning ramp of `fanOn`): lead decision 56 makes the case unreachable, and "Pair correction, high key" covers the rule (C9 11, C2 17). Run this step on the prep 2.0 tree (fakes, `index.html`, stubs in place) and list exactly the tests that fail there. List every skip in this step's commit message. |
| 3. Client calls | `web/api.js`, `tests/web-api.test.js` | The seven functions of C5 4.3 pass against the fake (C5 7.10 row "revision 7 additions") |
| 4. `index.html` (finding 2) | `index.html` | Exactly C5 1.2: menu Rooms · Batches · Test bench (C10 14), the `web/harvest.css` link, the harvest script tags (`harvest-rules.js`, `web/vendor/qrcodegen.js`, `web/batches.js`, `web/harvest.js`), the script tags of C5 1.3 (`air.js` after `sim.js`; `cycle.js`, `equipment.js`, `web/room-tabs.js`, `web/room-equipment.js`, the three tab files). Until gate 2.5 the `web/room-equipment.js` tag gives 404 on a tree without the card; no headless check runs before then |
| 4b. Tab registry and stubs | `web/room-tabs.js` (real, C5 3.9), `tests/web-room-tabs.test.js` (register, get, `NAMES`, unknown name throws), stubs `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js` (the C5 1.4 wrapper, registering nothing) | The C5 1.7 start check passes |
| 5. Equipment stub | `equipment.js`: the frozen C8 constants (`AC_SIZES`, `CONSTRUCTIONS`, `FOGGER_SIZES`, `AIR_SIZES`, `DEFAULTS`, `LIMITS`, `SOL_AIR_K`, `MARGIN`, `SHARE`, `RUNS`, `MAX_RUNS`, deep-frozen as C8 4.1) and the real `checkEquipment` (C8 4.3); `geometry`, `shell`, `plantOf`, `estimate`, `runCheckSteps`, `runCheck`, `runCheckAsync` throw `Error('stub')` | `require('./equipment.js')` after `sim.js`, `air.js`, `controller.js`, `runtime.js`, `capacity.js`, `cycle.js` works; `ClimateEquipment.checkEquipment(ClimateEquipment.DEFAULTS)` is `[]`; `plantOf` throws `stub`; it reads only `ClimateSim` at load (C8 1) |
| 5b. Harvest files (C10 2, lead decisions 59–61; harvest plan tasks 0.2–0.4) | `harvest-rules.js` and `tests/harvest-rules.test.js` (task 0.2: 43 tests); `web/vendor/qrcodegen.js` (Nayuki QR Code generator, MIT, compiled, pinned commit 3c6d0b3) and `tests/qrcodegen.test.js` (task 0.3); `server/harvest-schema.js` (`SCHEMA_V4_HARVEST`, C10 3), `server/api-common.js` (`HttpError`, C10 8.1), stubs `web/batches.js`, `web/harvest.js`, `web/harvest.css`, `tests/fakes/harvest-db.js` and `tests/fake-harvest-db.test.js` (task 0.4); `web/api.js` + `tests/web-api.test.js` (the ten functions of C10 12.1); `tests/fakes/api-server.js` + test (`GET /api/batches` → `[]`, `/harvest-rules.js` served); `tests/fakes/db.js` + `tests/fake-db.test.js` (`version` 4, `sqlite: null`) | Each file exactly as the harvest plan's task code; `npm test` `# fail 0` |
| 6. Briefs | `docs/superpowers/plans/2026-10-08-farm-foundation/`: `data-2.md`, `server-2.md`, `room-shell.md`, `room-live.md`, `room-simulate.md`, `room-calibrate.md`, `bench.md`, `docs.md` (rewritten), `harvest-data.md`, `harvest-api.md`, `harvest-web.md` (new; owned files exactly as C10 2, harvest plan task 0.5), and the C10 14 rows added to `data-2.md`, `server-2.md` (also: rename `HttpError`'s text field `errorText` → `error` with the class moved to `server/api-common.js`, and map `NotFoundError` `batch` / `crate` to 404 `Unknown batch` / `Unknown crate` in `mapError`, C3 2.1, 4.1; the two stand-in harvest modules of the `server/main.js` stub test, C3 12.1), `room-shell.md`, `docs.md`; `harvest-web.md` says the stream has Node tests only; the pages' headless check is the lead's in wave 3 (C5 7.10, C10 13); `equipment.md` is already committed (revision 3, section 8): only check it is unchanged | Every brief regenerated from the frozen contracts; each names its owned files exactly as section 3, its start checks, its done-when; the server-2 brief says no test depends on `co2Lim`, `rules.fanOn` or `rules.fanOff` ramping after a lowering change (lead decision 56, C2 9.1) |
| 7. Gate | – | `npm test` gives `# fail 0` on `master` (672 + the prep tests, with exactly the skips of step 2b); `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js docs/contracts/equipment.md harvest-rules.js web/vendor/qrcodegen.js server/harvest-schema.js server/api-common.js web/batches.js web/harvest.js web/harvest.css tests/fakes/harvest-db.js` lists all fourteen |

| Prep rule | Detail |
|---|---|
| Not in prep 2.0 | The room drawing (done, lead decision 53, section 7). |
| Worktrees | The lead makes each stream's worktree from `master` after step 7 (`git worktree add`, branch `stream/<name>`), outside `/home/foqcus/Documents/mushroom-farm` (another developer's working tree) |

## 3. Streams (parallel, one worktree each, from `master` after prep 2.0)

| Stream | Branch | Owns (files) | Builds against | Done when |
|---|---|---|---|---|
| Data 2 | `stream/data-2` | `server/db.js`, `tests/db.test.js` | C1 revision 6 (upgrade 3, the C10 upgrade 4 entry and `db.sqlite`, 4.2, 6.1–6.3, 6.6, 6.10, 6.13, 6.14, 8) | Upgrades 3 and 4 apply on a version 2 file and, after C9's upgrade 2, on a version 1 file (the C1 8 upgrade tests); `db.version` 4; every new and changed function passes C1 8 on both the real db and the fake; no prep 2.0 skip left in `tests/db.test.js` |
| Equipment | `stream/equipment` | `equipment.js` (replaces the prep 2.0 stub), `sim.js`, `capacity.js`, `cycle.js`, `controller.js`, `web/settings-panel.js` (the `#inCrop` lion's mane option only, lead decision 47), `tools/make-vectors.js`, `tests/vectors/cool-crop.json`, `tests/vectors/stage-changes.json` (regenerated for C9 revision 2), `tests/sim.test.js`, `tests/equipment.test.js`, `tests/web-settings-panel.test.js`, `tests/cycle.test.js` (append), `tests/controller.test.js` (append, plus the rewrite of its ramp test at line 127 for C9 revision 2), `tests/capacity.test.js` (append), `web/room-equipment.js`, `tests/web-room-equipment.test.js` | C8 revision 3, C7 revision 3, C9 revision 2 (the CO₂ limit at a stage change; the rest read-only), C5 3.12 | The brief's done-when: C8 14 tests pass; 8 old vectors byte-identical, `stage-changes.json` regenerated (it first changes at step 129, t 3870 s, C9 revision 2), `cool-crop.json` added (10 vector tests); the C7 default cycle passes (`totals.pass` true, pinning `co2Below` ≥ 99.9 % as measured in `/home/foqcus/Documents/mushroom-farm-drafts/ramp-fix/`) and is deep-equal to commit 1 (brief 7.1); REAL1 gives `min` 1.5, `recommended` 2 and the exact first summary line (C8 13.3); the card's Node tests pass; after gate 2.5, the card's headless check (C5 7.10, lead decision 49) |
| Server 2 | `stream/server-2` | `server/api.js`, `server/static.js`, `server/rooms.js`, `server/sim-adapter.js`, `room-rules.js`, `tests/api.test.js`, `tests/rooms.test.js`, `tests/room-rules.test.js` | The C1 fake (prep 2.0), C2 revision 9, C3 revision 9, C9 6.3 (read-only), the prep 2.0 `equipment.js` stub | Routes 6.20–6.26 (6.26 with the `airM3h` settings sync, lead decision 35), the 6.8 and 6.13 changes, `/cycle.js`, `/equipment.js` (`/air.js` is already served), the 18-key ReadingRow with `air`, `live.flush`, `live.blocks` and `live.air` (lead decision 27), `env.plant` pass against the fakes (C3 12, C2 17); the `Upgraded: air exchange` save of `startLoopFromRow` moved out of the steps 2–6 `try` (C2 8.1, a db error is thrown), with a test; `room-rules.js` loads without `equipment.js` (C3 7.1); `createApi(opts.extraRoutes)` and `HttpError` from `server/api-common.js` (C10 8, lead decision 62), `DELETE` on C10 9.7 and 9.10, `/harvest-rules.js` served (C10 10); the C2 "Room equipment" test is skipped while `plantOf` throws `stub` and runs at gate 2.5 (lead decision 48); no prep 2.0 skip left in `tests/rooms.test.js` and `tests/api.test.js` |
| Room shell | `stream/room-shell` | `styles.css` (one appended `/* Room page */` block only), `web/shell.js` (with C10 11: `#/batches`, `#/batches/:id`, `#/harvest/stickers`, `#/harvest/:id`, module names `batches` and `harvest`, the bare layout, lead decision 66), `web/rooms.js`, `tests/web-shell.test.js`, `tests/web-rooms.test.js` | C5 revision 8 (1.2, 1.3, 2, 3.7 import, 3.8, 3.9, the CSS row of 3.8; `index.html` is the lead's, prep 2.0), C3, C4 | The C5 7.10 Room shell row: Node tests now; headless after gate 2.5 |
| Live tab | `stream/room-live` | `web/room-live.js`, `tests/web-room-live.test.js` | C5 3.4, 3.9, 7.9; C6; C9 7 (the air exchange card, glance row, purge ladder and bars it reuses) | The C5 7.10 Live tab row |
| Simulate tab | `stream/room-simulate` | `web/room-simulate.js`, `tests/web-room-simulate.test.js` | C5 3.7 (`sameMix`), 3.9, 3.10, 3.12 (the card's `mount` interface); C3 3.9–3.11, 6.20–6.25; C7; C8 4.5 (`plantOf`); C9 8 (`room.airM3h`) | The C5 7.10 Simulate tab row |
| Calibrate tab | `stream/room-calibrate` | `web/room-calibrate.js`, `web/charts.js` (the C5 6.2 `drawCalibCharts` options only), `tests/web-room-calibrate.test.js`, `tests/web-charts.test.js` (append) | C5 3.6, 3.9, 3.11, 6.2; C3 3.2, 3.6, 6.8, 6.13, 6.20–6.23, 6.25; C8 4.5 | The C5 7.10 Calibrate tab row |
| Bench | `stream/bench` | `web/simulator.js` (the room link, `#/simulator/:id`, the calibration event text and the Node export with `createRoomLink` and `mimicLayout`; not the mimic code or C9's air card code), `calib.js`, `tests/web-room-link.test.js`, `tests/calib.test.js` (append) | C5 7.8 (with the revision 8 rules), 2.1; C9 7 (the test bench's `#inAirM3h`, unchanged); lead decisions 23, 28, 51, 53 | The C5 7.10 Bench row; every existing calib and bench test green |
| Docs | `stream/docs` | `README.md`, `docs/contract.md`, `docs/phase3-plan.md`, `tests/docs.test.js` | All contracts | The README describes the Rooms home, the three tabs, the Test bench, simulation runs, the equipment check, the air exchange (C9), upgrades 2, 3 and 4 (C9's rebuild of `readings`, wave 2's one-time scan, C10's two tables) and backups, the stickers page with the fixed farm address advice, and `TZ=Asia/Kuala_Lumpur` for the service (C10 14, lead decision 67); `tests/docs.test.js` passes |
| Harvest data | `stream/harvest-data` | `server/harvest-db.js`, `tests/harvest-db.test.js` | C10 3, 5; the fake db (version 4) | Every C10 13 row of `tests/harvest-db.test.js` passes on the fake store and, until gate 2.5, on a real store over a `DatabaseSync` that runs `SCHEMA_V4_HARVEST` itself (upgrade 4 in `UPGRADES` is Data 2's) |
| Harvest API | `stream/harvest-api` | `server/harvest-api.js`, `tests/harvest-api.test.js` | C10 4, 6–9; the fake db and the fake store (prep 2.0) | Every C10 13 row of `tests/harvest-api.test.js` passes |
| Harvest web | `stream/harvest-web` | `web/batches.js`, `web/harvest.js`, `web/harvest.css` (each replaces its prep 2.0 stub), `tests/web-batches.test.js`, `tests/web-harvest.test.js` | C10 10–12; the fake API server | Node helpers pass (C10 13); no headless check (the lead's wave 3 check, C5 7.10) |

### 3.1 One owner per file

| File or group | Owner in wave 2 |
|---|---|
| `docs/contracts/*`, the spec, this plan, `docs/research/*`, every brief (the Equipment brief included) | Lead (prep 2.0) |
| `tests/fakes/db.js`, `tests/fakes/rooms.js`, `tests/fakes/api-server.js`, `tests/fake-db.test.js`, `tests/fake-rooms.test.js`, `tests/fake-api-server.test.js`, `index.html` | Lead (prep 2.0), then nobody |
| `tests/db.test.js`, `tests/rooms.test.js`, `tests/api.test.js` | Lead in prep 2.0 (step 2b: skips and the api key list only), then Data 2 (`tests/db.test.js`) and Server 2 (the other two), which remove every skip |
| `web/api.js`, `tests/web-api.test.js`, `web/room-tabs.js`, `tests/web-room-tabs.test.js` | Lead (prep 2.0) |
| `harvest-rules.js`, `tests/harvest-rules.test.js`, `web/vendor/qrcodegen.js`, `tests/qrcodegen.test.js`, `server/harvest-schema.js`, `server/api-common.js`, `tests/fakes/harvest-db.js`, `tests/fake-harvest-db.test.js` | Lead (prep 2.0), then nobody (C10 2) |
| `web/batches.js`, `web/harvest.js`, `web/harvest.css` | Lead (prep 2.0 stubs), then Harvest web (lead decision 65: `web/harvest.css` is Harvest web's own stylesheet; decision 32 holds for `styles.css`) |
| `tests/harvest-db.test.js` | Harvest data; its real-store half runs on a `DatabaseSync` stand-in (`SCHEMA_V4_HARVEST` run by the test) until gate 2.5, where the lead switches it to `openDb(':memory:')` in step 3b (one edit, combined check I8) |
| `server/main.js` | Lead at gate 2.5 (C10 8.4 wiring only). The two stand-in harvest modules and the `STUB_HARVEST_THROW` row of the `server/main.js` stub test are Server 2's (C3 12.1) |
| `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js` | Lead (prep 2.0 stubs), then the Live tab, Simulate tab and Calibrate tab streams (each replaces its stub) |
| `equipment.js` | Lead (prep 2.0 stub), then Equipment (replaces it) |
| Every file in the "Owns" column of section 3 | That stream only |
| `web/capacity.js`, `web/calibration.js`, `tests/web-load.test.js`, `tests/web-bench.test.js`, `tests/api-real.test.js`, `docs/ROADMAP.md` | Nobody in wave 2; the lead in wave 3 |
| `tests/web-mimic.test.js`, the mimic and air card code of `web/simulator.js` and their styles in `styles.css` | Nobody in wave 2 (done by the drawing fix and C9, section 7); the lead in wave 3 (lead decision 51) |
| `air.js`, `tests/air.test.js`, `tests/web-air.test.js`, `tests/integration.test.js`, `tests/harness.js`, `docs/contracts/air.md` | Nobody in wave 2 (C9, frozen); the lead in wave 3 when a merge needs it |
| `room-rules.js`, `server/static.js` (C9 changed them) | Server 2 (section 3) |
| `web/settings-panel.js`, `web/charts.js` (C9 changed them) | Equipment (the `#inCrop` option only) and Calibrate tab (the `drawCalibCharts` options only) |
| Every other file | Nobody (read-only) |

## 4. Rules for every stream

| Rule | Detail |
|---|---|
| Server streams vs web streams | The web streams and the Equipment card need the new routes, the new Reading keys and the real `equipment.js` on a real server for their headless checks. They run those checks after gate 2.5, on a tree that holds the gate 2.5 `master` plus their own changed files (C5 7.10); until then they test in Node against the fake API and the `equipment.js` stub. |
| No merging of `master` | Streams never merge or rebase `master` into their branches; the lead merges. A check tree is built with `git archive` (C5 7.10). |
| `styles.css` | Only the Room shell stream changes it (one appended `/* Room page */` block); C5 3.8 names every class the tabs and the Equipment card use (lead decision 32) |
| Start checks | Every web stream: the C5 1.7 start check. Every stream: `git branch --show-current` is its branch, `npm test` gives `# fail 0` with exactly the prep 2.0 skips (write down the `# pass` and `# skipped` baseline). Equipment also: the brief's start checks (`ls equipment.js docs/contracts/equipment.md`, the stub still in place). |
| Contract questions | A stream that finds a contract gap stops that part and reports to the lead; only the lead changes a contract |
| Git | Keep the configured identity; never change `git config`; plain commit messages with no attribution lines; never commit on `master`; never push |
| Models | Implementers on Sonnet, reviewers on Opus |
| Reviews | Every stream gets a spec-compliance review and a code-quality review before the lead merges it |

## 5. Gate 2.5 (lead, inside wave 2)

| Step | Action | Passes when |
|---|---|---|
| 0 (finding 25) | Before step 1, make two database files. Version 1: `git archive 89a0efa \| tar -x -C <dir>` (a tree before C9), then in `<dir>` run `FARM_HOST=127.0.0.1 FARM_PORT=<free port> FARM_DB=<keep>/v1.db npm start` for 70 s and stop it with `SIGINT`. Version 2: the same on the prep 2.0 `master` with `FARM_DB=<keep>/v2.db`. Keep both outside the repo | `v1.db` has `schema_version` max 1, `v2.db` max 2; both have `Room 1` with readings |
| 1 | Merge `stream/data-2` into `master`; `npm test` | Green |
| 2 | Merge `stream/equipment`; `npm test` | Green; 10 vector tests; the lead re-measures C7 12.6 (the default cycle passes) |
| 3 | Merge `stream/server-2`; `npm test` | Green; the C2 "Room equipment" test now runs (not skipped) against the real `plantOf` |
| 3b | Merge `stream/harvest-data`, then `stream/harvest-api`; point the real-store half of `tests/harvest-db.test.js` at `openDb(':memory:')` (upgrade 4 is now in `UPGRADES`); wire `server/main.js` (C10 8.4, with the `openHarvest` failure rule of C3 2.2; the stub test's stand-ins and its guarded `STUB_HARVEST_THROW` row are already Server 2's, C3 12.1, and start running once `main.js` is wired); `npm test` | Green |
| 4 | Start gate (C3 12.2), once with a copy of `v1.db` and once with a copy of `v2.db`: `FARM_HOST=127.0.0.1 FARM_PORT=<free port> FARM_DB=<copy> npm start` | The server prints `Open http://127.0.0.1:<port>`; `schema_version` has rows 2 and 3 (from `v1.db`) or row 3 added (from `v2.db`); `Room 1` keeps its old readings (`air` 0/1) and records new ones with `ac_fan`, `stage`, `core`; `schema_version` has row 4 and `db.version` is 4; `curl` creates a batch, places it in Room 1, adds two crates, and `GET /api/batches/<id>` gives the totals of `harvest-rules.js`; `GET /harvest-rules.js` gives 200; `GET /air.js`, `GET /cycle.js` and `GET /equipment.js` give 200; `SIGINT` exits 0 |
| 5 | Tell the web streams and Equipment | Their headless checks run on this `master` (section 4) |

| Gate rule | Detail |
|---|---|
| A failure | Fixed on the stream's branch (re-reviewed) and merged again, or on `master` by the lead; the web streams wait for the gate |
| Streams merged at 2.5 | Merge again in wave 3 only when they have later commits (for example the Equipment card's headless fixes, lead decision 49) |

## 6. Wave 3 (lead)

### 6.1 Merge order

| # | Stream | After the merge |
|---|---|---|
| 1 | Data 2 (later commits only) | `npm test` |
| 2 | Equipment (later commits only) | `npm test` |
| 3 | Server 2 (later commits only) | `npm test` |
| 4 | Room shell | `npm test` |
| 5 | Live tab | `npm test` |
| 6 | Simulate tab | `npm test` |
| 7 | Calibrate tab | `npm test` |
| 8 | Bench | `npm test` |
| 9 | Docs | `npm test` |
| 10 | Harvest data, Harvest API (later commits only) | `npm test` |
| 11 | Harvest web | `npm test`; the lead runs the harvest pages' headless check (C5 7.10, C10 13) |

### 6.2 Lead work

| Item | Detail |
|---|---|
| Clean-up | Delete `web/capacity.js`, `web/calibration.js` and `FarmBench` (and its tests in `tests/web-bench.test.js`); update `tests/web-load.test.js` (globals `ClimateCycle`, `ClimateEquipment`, `FarmRoomTabs`, `FarmEquipmentCard`; modules `rooms`, `simulator`; tabs `live`, `simulate`, `calibrate`) (lead decision 29) |
| `mimicLayout` | The Bench stream adds `mimicLayout` to the Node export of `web/simulator.js` (beside `createRoomLink` and C9's `airText`); the lead points `tests/web-mimic.test.js` (and `tests/web-air.test.js` where it reads `FarmBench`) at `require('../web/simulator.js')`, then deletes `FarmBench` (lead decision 51) |
| `tests/api-real.test.js` | Written and run (C3 12.2), with 6.20–6.26 (a small hand-made Result for 6.21) and C10 9.1–9.10 once each |
| Harvest pages headless (C10 13, C5 7.10) | The lead's check on the final merge |
| Phone check (C10 13) | Print one sticker, scan it with a real phone on the farm Wi-Fi, record two crates, Undo one, see them on `#/batches/:id` |
| Headless checks | Every C5 7.10 row again through the real room page; the Test bench room pick on `#/simulator/1`; the Equipment card inside the Simulate tab (mount, **Check my machines** with a short program, the Saved runs row `Equipment`, **Open**) |
| Start gate | C3 12.2 again on the final merge, with copies of `v1.db` and `v2.db` (section 5 step 0) |
| Roadmap | `docs/ROADMAP.md`: the wave 2 rows marked built, Batches and Harvest included |

## 7. The room drawing (done before wave 2)

| Item | State |
|---|---|
| Drawing fix | Merged on `master` (4849b67, branch `fix/room-drawing`, lead decision 53) |
| C9 rewrite | C9 7 replaced the fan and passive opening by two fans (`SF-203`, `EF-206`) with closed dampers; `mimicLayout({ inletAt, exhaustAt })` is exported on `FarmBench` (b5cc5a5) |
| Wave 2 | No stream changes the mimic or the air card code of `web/simulator.js` or their styles. The Bench stream adds `mimicLayout` to the Node export (lead decision 51); the lead moves `tests/web-mimic.test.js` in wave 3 (6.2) |
| Labels | The calibration label rename (`Heat through walls and roof (W/K)`) is the Bench stream's (lead decision 28) |

## 8. Briefs

| Brief | Fate | Content |
|---|---|---|
| `rooms-ui.md` | Replaced by `room-shell.md` and `room-live.md` | Its pure functions split by user; the frame mechanics, list and CSS to Room shell; the room page rows 2–10 to the Live tab; checks per C5 7.10 |
| `capacity-calibration.md` | Replaced by `room-simulate.md` and `room-calibrate.md`; the import part goes to `room-shell.md` | Helpers `toCapacityMix`, `toMixRows`, `sameMix`, `appliedCalib`, `farmDate`, `readStored`, `importPlan`, `importRooms`, `envBaseFor`, `paramsOfRun`, `startParams`, `defaultBlocks`, `parseBlocks`, `calibBody` and its decisions, updated to C5 3.6–3.11 |
| `simulator-link.md` | Replaced by `bench.md` | Sections 5–6 of `simulator-link.md` verbatim (the room link `createRoomLink(deps)`, also in C5 7.8; finding 26), with the test file renamed `tests/web-room-link.test.js`; `#/simulator/:id`; the label and note (lead decision 28); `stage` per row in `calib.js`; `mimicLayout` in the Node export; no drawing work (lead decision 53). Headless (finding 14, delta review R3): the room pick (`{ roomId: 1 }`, `#/simulator/1`) is the lead's wave 3 check (after Room shell), not the Bench stream's |
| `docs.md` | Rewritten | Same structure and `tests/docs.test.js` approach; content from the amended contracts. Its T7 (the README's adapter example) uses the C2 adapter-factory arguments `{ room, calib: null, blocks: null, equipment: null, cfg, snapshot: null, now }`. `tests/docs.test.js` checks the README for: no `vent`; the 18 Reading keys with `air`; the room statuses; the air exchange (C9) and upgrades 2 and 3 (buildability check) |
| – | New: `data-2.md`, `server-2.md` | C1 revision 6; C2 revision 9 and C3 revision 9 (with C9 6 read-only) |
| – | New: `equipment.md` (revision 3, committed on this branch with the contracts; prep 2.0 only checks it is on `master` unchanged) | Written from the reviewed draft (old fan model) onto C8 revision 3, C9 revisions 1–2 and `master` bd24755; the edits of 8.1 are applied. The Equipment stream reads it and does not change it |
| `api.md`, `data.md`, `rooms.md`, `web-split.md`, `lead-fakes.md`, `cycle.md` | Kept (waves 0, 1 and the cycle stream: history) | – |

### 8.1 Equipment brief edits (applied in `equipment.md` revision 3)

| # | Edit |
|---|---|
| 1 | C8 revision 3 everywhere: `air_m3h`, `AIR_SIZES`, `RUNS.air`, run kind `'air'`, the 8.4 air exchange verdict with its five example texts as tests, no `FAN_MIN_ACH`, no fan-first text or summary line (S-FANFIRST deleted), one cool-crop rule (the controller tests and `cool-crop.json` exercise only the no-heat rule), `room.airM3h` in each run call, the C9 load order (`air.js` after `sim.js`) |
| 2 | The stub check `grep -c "Error('stub')" equipment.js` (not `not installed`); the research paths `docs/research/…` |
| 3 | S-WET (findings 20, lead decisions 43, 46): `wet.text` starts `The room is too wet in fruiting 1 (above 95 % RH 24 % of the time).`; `insulation.text` = `Walls and roof: good. They bring in 23 % of the heat. An insulated room also needs drier fresh air. (Typical walls: set the walls and roof of this room for a better answer.)`; summary 6 lines (ac, wet, fogger, air, insulation, breakdown) |
| 4 | S-OWNBELOW (finding 20, lead decision 45): text ends ` It is just enough: it has no reserve for the hottest days, but no bigger size holds this room steadier (2.5 hp is too big).`; summary 4 lines, no breakdown |
| 5 | S-MARGCOLD (finding 20): text ends `You need at least 2 hp. It is just enough: it has no reserve for the hottest days, but no bigger size holds this room steadier (2.5 hp is too big).`; summary 5 lines, ending with the breakdown text (its own 1 hp is `too-small`, C8 8.8 row 6) |
| 6 | Task 17 (finding 21 a): `FARM_HOST=127.0.0.1 FARM_PORT=<free port> FARM_DB=$T/check.db npm start`, open `http://127.0.0.1:<port>/` |
| 7 | Stale references (finding 21 b): "C8 12.5 (the card)" → "C5 3.12"; "room-centred 6.7 'Headless checks of one tab'" → "C5 3.9" |
| 8 | Baseline (finding 21 c, S13): `npm test` 672 pass on `master` bd24755; prep 2.0 drops the Pair correction test (lead decision 56 makes its case unreachable, C9 11) and adds the prep tests. The stream rewrites one ramp test in `tests/controller.test.js` and adds the cool-crop vector and CROPLIST: it expects the prep 2.0 count + 2 (674 counting from bd24755 with the Pair correction test kept as a rewrite, 673 with it dropped as here; the brief records the exact start count) |
| 9 | New test S-LARGEST (finding 21 d): `room({ ac_hp: 1, walls: 'zinc', roof: 'zinc' })`, `lm(1000)`, settings `LM()`. The C9 estimate with lead decision 57 is 16179 W → 6 hp (C8 6; 16120 W < 16179 W, so 6 hp is the largest size, not a covering one). Scripted: pass only when `hpOf ≥ 6`, else `{ fails: HOT, inT: 50 }`. Expect sizes `[1, 5, 6]`, `min` 6, `recommended` 6, `noReserve` `'largest'`, text ends `You need at least 6 hp. It has no reserve for the hottest days: fix the room first (see the heat breakdown).`, summary ends with the breakdown text |
| 10 | New test S-WET2 (finding 21 e): a `fakeResult` with two segments (pinning 1 wet 16, fruiting 1 wet 15; both failing `humidity near saturation`); `wet.text` starts `The room is too wet in pinning 1 (above 98 % RH 16 % of the time) and fruiting 1 (above 95 % RH 15 % of the time).` |
| 11 | Load rule (finding 21 f): the prototype reads `ClimateController`, `ClimateCapacity`, `ClimateCycle` at load; C8 1 requires reading them (and `ClimateAir`) only inside `estimate` and the run functions. The brief says so where it quotes prototype code |
| 12 | REAL1 (C8 14 row 10): the numbers of C8 13.3 (with lead decisions 56, 57): `min` 1.5, `recommended` 2, sizes `[1, 1.5, 2]`, the summary line 1 text, `wet` `null`, `pass` `true`, the air exchange `enough` (`needM3h` 800, `recommended` `null`); `CROPS.lionsmane.pinning` `[17, 92, 1000]` (lead decision 57); the `oversized` air row and its example as tests (lead decision 58) |
| 13 | The C9 prototype for measurements: `/home/foqcus/Documents/mushroom-farm-c8/proto-c9/` (diffs against `master` 6a12852 and the scripts) |
| 14 | C9 revision 2 (lead decision 56): the `controller.js` change of `/home/foqcus/Documents/mushroom-farm-drafts/ramp-fix/fixB.diff` plus the 10 × `purgeMaxS` bound; tests for the at-once limits (T, RH, `co2SafetyAt` still ramp), the uncapped first purge, its bound and `capRun` untouched; `stage-changes.json` regenerated; the rewrite of `tests/controller.test.js` line 127 |

## 9. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| A full cycle is slower in a phone browser (2–3 × Node) | 10–15 s for the default cycle, minutes for long programs; an equipment check 30–60 s | Per-day progress; the 180-day confirm; a server worker later (lead decision 17) |
| History fit of 7 days of raw readings | About 20,000 rows × up to 400 replays in the browser | Default 2 days; the fit already yields to the page (`fitAsync`) |
| Web streams need the new server routes for their real-server checks | Waiting inside wave 2 | Node tests against the fakes and the stub first; gate 2.5 merges Data 2, Equipment and Server 2 early |
| Upgrades 2 and 3 at the first start of a version 1 file: C9's upgrade 2 rebuilds `readings`, upgrade 3 scans it once (the `ac_fan` `CHECK`) | Seconds to a minute on a large file | One-time; the README says so (Docs stream) |
| The drawing fix and the Bench and Room shell streams edit the same files | Textual merge conflicts | Different parts of the files (section 7); `npm test` and the Bench headless check after the merge |
| The Simulate tab's Node tests run without `web/room-equipment.js` | The slot cannot be tested with the real card before gate 2.5 | The slot shows `The machines check is not installed.` without `FarmEquipmentCard` (C5 3.10); the card inside the tab is the lead's wave 3 check |

## 10. Freeze-check findings (2026-10-09) and how they were resolved

The 27 findings of the freeze check of the folded drafts (`wave2/contracts-folded`, 75a2ad5), resolved in this revision on top of C9. Every one still applied after the move to C9; none was dropped.

| # | Severity | Place | Resolution |
|---|---|---|---|
| 1 | Blocking | Plan 2 | Step 2b: the lead adds listed skips to exactly the tests that fail against the new fakes; Data 2 and Server 2 remove them (3, 3.1); step 7 and the start checks allow exactly those skips |
| 2 | Blocking | C5 1.1, 1.7; plan 2, 3.1; decision 29 | `index.html` moves to prep 2.0 (step 4) and is the lead's; Room shell no longer owns it; C5 1.1 and 1.7 rows |
| 3 | Important | C5 1.7, 4.5; plan 2 | The fake API server serves `/air.js` (missing on `master`), `/cycle.js` and `/equipment.js`, tested in `tests/fake-api-server.test.js` |
| 4 | Important | C3 7.1; C5 1.3; C8 12.4 | `room-rules.js` reads `ClimateEquipment` only when its functions are called; loading it without `equipment.js` must not throw; new `tests/room-rules.test.js` row |
| 5 | Important | C5 3.10 | Saved runs: the Result chip is `info.verdict` for every kind (equipment: `enough`, `too small`, `too big`, `bigger than needed`, `impossible`) |
| 6 | Minor | C3 header, 2.3 | Binding decisions 1–55; code owner "API stream (wave 1), Server 2 stream (wave 2)"; lead decision 8 box retitled as recorded and amended by 31 |
| 7 | Minor | C8 16, 5.4.3 | Change log in revision order with the superseded note; the `#inCrop` lines cited on `master` 6a12852 (183–192, `setVal` line 570) |
| 8 | Minor | Spec 3 | Readings ranges: raw rows up to 7 days; with a `step` up to 31 days, or up to 1300 days with a `step` of 1 h or more (C3 6.8) |
| 9 | Minor | C5 3.11 | `base: { series: … }` for `drawCalibCharts`; no request when the run starts in the future |
| 10 | Minor | C2 header, 17 | Duplicate "Spec:" line removed; the equipment test reads `env` through a spy on `ClimateSim.create` |
| 11 | Blocking | Plan 2, 3.1 | As finding 1 (step 2b), plus the 18-key list of `tests/api.test.js` and the removed "shared db test" clause |
| 12 | Important | C3 7.1 | As finding 4 |
| 13 | Important | C5 3.9, 7.10 | With `index.html` in prep 2.0 the gate 2.5 tree loads every wave 2 script; a tab check mounts its tab by hand through `FarmRoomTabs`; no layout assertions (the Room shell CSS is absent) |
| 14 | Important | C5 7.10; plan 8 | The Bench check mounts the simulator module with `{ roomId: 1 }`; `#/simulator/1` is the lead's wave 3 check |
| 15 | Important | C5 3.11, 7.8 | Calibrate shows the note only when `PARAMS.ua.note` is a string and its tests do not assert label or note text; `replay` may ignore `stage` before the Bench merge; the exact note text in C5 7.8 |
| 16 | Important | C5 3.10 | As finding 5: Energy for an equipment run is `–` in the list; **Open** shows the report |
| 17 | Important | C3 7.6, 8; C5 3.10 | `inputs.calibration` has exactly `id`, `ua`, `inf_ach`, `moist_buffer`, `co2_per_block`; any other key is `unknown field` |
| 18 | Important | C2 17 | As finding 10: the spy on `ClimateSim.create` |
| 19 | Important | Plan 2 | As finding 3 |
| 20 | Important | Plan 8.1 | S-WET, S-OWNBELOW, S-MARGCOLD texts and line counts (rows 3–5) |
| 21 | Important | Plan 8.1 | Items a–g as rows 6–11 and the brief path (row "equipment.md" of 8) |
| 22 | Minor | C5 3.10, 3.11 | Node tests of the with-machines branch replace `ClimateEquipment.plantOf` with a recorder and assert its arguments |
| 23 | Minor | C1 6.14, 8 | `saveEquipment` missing field: `TypeError('saveEquipment: missing field "<key>"')`, first missing key in field order (with `air_m3h`) |
| 24 | Minor | C8 1, 5.3, 5.4.3, 13, 16 | Line numbers and counts re-taken on `master` 6a12852 (5.3 line 184, 670 tests); speed "2–5"; the revision 1 row marked superseded |
| 25 | Minor | Plan 5 | Step 0 makes a version 1 file (from 89a0efa) and a version 2 file (prep 2.0 `master`) |
| 26 | Minor | C5 7.8; plan 8 | The `createRoomLink(deps)` signature and members in C5 7.8; `bench.md` carries `simulator-link.md` sections 5–6 with the test file `tests/web-room-link.test.js` |
| 27 | Minor | C5 7.10 | The Live tab check feeds `reading` events and, after each, `listRooms()` room 1 to the `room` listeners |

## 11. Decided by the lead or the owner (2026-10-09)

| # | Item | Measured | Proposal |
|---|---|---|---|
| 1 | Lion's mane pinning CO₂ limit (C8 15 item 12) | With 700: frequent wet purges, pinning too wet at every size | Decided by the owner: 1000 (lead decision 57). Measured with decision 56: the owner's example passes the whole cycle from 1.5 hp, buy 2 hp |
| 2 | The stage ramp and C7's CO₂ rule (C8 15 item 13) | Every crop's full cycle failed `CO₂ above the limit` in pinning on `master` 6a12852 | Decided (lead ruling 2026-10-09, lead decision 56, C9 revision 2): a lower CO₂ limit applies at once at a stage change, with one uncapped purge (bounded at 10 × `purgeMaxS`); built by the Equipment stream. On bd24755 (with `master`'s ramped-limit scoring and 600 ppm floor) no `airTooSmall` remains in the default cycle |
| 3 | Air exchange `oversized` verdict (C9 10; C8 15 item 14) | With 700, 2400 and 3600 m³/h made pinning too hot; with 1000 all sizes 900–3600 pass | Decided (lead decision 58): `oversized` at 3 `AIR_SIZES` steps above the recommended size. The owner's example's 1800 m³/h default (2 steps above its 900 m³/h size) stays `enough` |
| 4 | C9 spec 4.1 wording example (C8 15 item 15) | 900 m³/h never reaches 700 ppm with 6000 blocks; need 1450 m³/h | Done: a note in C9 revision 2's change table |
| 5 | The fake API server on `master` lacks `/air.js` (a C9 gap; S11 of this pass) | Headless checks with `startFakeApi` and `master`'s `index.html` get a 404 | Fixed in prep 2.0 (step 2) |

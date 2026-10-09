# Wave 2 plan: room-centred app and the equipment check

Date: 2026-10-08. Status: **frozen** (lead decision 31). Changes only through the lead. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md` (section 6). Repo: `mushroom-farm` (plain JavaScript, CommonJS, no build step, no npm dependencies, Node.js 22.13 or newer; this machine has 22.20).

| Binding source, in this order | Path |
|---|---|
| Lead decisions 1–54 | `docs/contracts/LEAD-DECISIONS.md` |
| C1 revision 5 (database) | `docs/contracts/db.md` |
| C2 revision 8 (room manager) | `docs/contracts/rooms.md` |
| C3 and C4 revision 8 (HTTP API, live feed) | `docs/contracts/api.md` |
| C5 and C6 revision 7 (web modules, settings editor) | `docs/contracts/web.md` |
| C7 revision 2 (crop cycle) | `docs/contracts/cycle.md` |
| C8 revision 2 (equipment check) | `docs/contracts/equipment.md` |
| This plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` |

## 1. Overview

| Phase | Who | What | Starts when |
|---|---|---|---|
| 2.0 | Lead | Prep: the frozen contracts on `master`, the fakes, the client calls, the tab registry and stubs, the `equipment.js` stub, the briefs (section 2) | `master` 89a0efa is green (584 tests) |
| 2 | Nine streams, in parallel, each in its own worktree | Data 2, Equipment, Server 2, Room shell, Live tab, Simulate tab, Calibrate tab, Bench, Docs (section 3) | Prep 2.0 is on `master` and green |
| 2.5 | Lead | Gate: merge Data 2, Equipment, then Server 2; run the real server on a version 1 database file (section 5) | Data 2, Equipment and Server 2 are reviewed |
| 2 (after 2.5) | The web streams and Equipment | Their headless Chrome checks against the real server on the gate 2.5 `master` (C5 7.10) | Gate 2.5 passes |
| 3 | Lead | Integration: merge in order, clean up, every test and check again (section 6) | Every stream is reviewed |
| Outside the waves | Another developer | The room drawing fix on branch `fix/room-drawing` (section 7) | Any time; no stream depends on it |

## 2. Prep 2.0 (lead, before any stream)

| Step | Files | Done when |
|---|---|---|
| 1. Freeze the contracts | `docs/contracts/db.md` (C1 rev 5), `rooms.md` (C2 rev 8), `api.md` (C3 rev 8), `web.md` (C5 rev 7), `cycle.md` (C7 rev 2), `equipment.md` (C8 rev 2), `LEAD-DECISIONS.md` (14–54), the spec, this plan, `docs/research/2026-10-08-lionsmane-research.md`, `docs/research/2026-10-08-equipment-facts.md` | Committed on `master` (one commit, plain message); `npm test` still green (documents only) |
| 2. Fakes | `tests/fakes/db.js`, `tests/fakes/rooms.js`, `tests/fakes/api-server.js`, `tests/fake-db.test.js`, `tests/fake-rooms.test.js`, `tests/fake-api-server.test.js` | The fake db follows C1 9 (version 2, the seven new functions, the new Reading and Calibration fields, the 275/3091/1299 lists); the fake room manager follows C2 16 (`flush: null`, `blocks: null`); the fake API server follows C5 4.5 (`/simulations` → `[]`, `GET …/equipment` → `null`, `DELETE` → `{}`); the shared db test runs the new rows against both dbs where the real db is not needed |
| 3. Client calls | `web/api.js`, `tests/web-api.test.js` | The seven functions of C5 4.3 pass against the fake (C5 7.10 row "revision 7 additions") |
| 4. Tab registry and stubs | `web/room-tabs.js` (real, C5 3.9), `tests/web-room-tabs.test.js` (register, get, `NAMES`, unknown name throws), stubs `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js` (the C5 1.4 wrapper, registering nothing) | The C5 1.7 start check passes |
| 5. Equipment stub | `equipment.js`: the frozen C8 constants (`AC_SIZES`, `CONSTRUCTIONS`, `FOGGER_SIZES`, `FAN_SIZES`, `DEFAULTS`, `LIMITS`, `FAN_MIN_ACH`, `SOL_AIR_K`, `MARGIN`, `SHARE`, `RUNS`, `MAX_RUNS`, deep-frozen as C8 4.1) and the real `checkEquipment` (C8 4.3); `geometry`, `shell`, `plantOf`, `estimate`, `runCheckSteps`, `runCheck`, `runCheckAsync` throw `Error('stub')` | `require('./equipment.js')` after `sim.js`, `controller.js`, `runtime.js`, `capacity.js`, `cycle.js` works; `ClimateEquipment.checkEquipment(ClimateEquipment.DEFAULTS)` is `[]`; `plantOf` throws `stub`; it reads only `ClimateSim` at load (C8 1) |
| 6. Briefs | `docs/superpowers/plans/2026-10-08-farm-foundation/`: `data-2.md`, `server-2.md`, `room-shell.md`, `room-live.md`, `room-simulate.md`, `room-calibrate.md`, `bench.md`, `docs.md` (rewritten); the Equipment brief from the reviewed draft (section 8) | Every brief regenerated from the frozen contracts; each names its owned files exactly as section 3, its start checks, its done-when |
| 7. Gate | – | `npm test` green on `master` (584 + the prep tests); `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js docs/contracts/equipment.md` lists all six |

| Prep rule | Detail |
|---|---|
| Not in prep 2.0 | The room drawing fix (lead decision 53, section 7). `index.html` is not changed in prep: the Room shell stream owns it. |
| Worktrees | The lead makes each stream's worktree from `master` after step 7 (`git worktree add`, branch `stream/<name>`), outside `/home/foqcus/Documents/mushroom-farm` (another developer's working tree) |

## 3. Streams (parallel, one worktree each, from `master` after prep 2.0)

| Stream | Branch | Owns (files) | Builds against | Done when |
|---|---|---|---|---|
| Data 2 | `stream/data-2` | `server/db.js`, `tests/db.test.js` | C1 revision 5 (4.3 upgrade 2, 4.2, 6.1–6.3, 6.6, 6.10, 6.13, 6.14, 8) | Upgrade 2 applies on a version 1 file (the C1 8 "Upgrade from version 1" test); every new and changed function passes C1 8 on both the real db and the fake |
| Equipment | `stream/equipment` | `equipment.js` (replaces the prep 2.0 stub), `sim.js`, `capacity.js`, `cycle.js`, `controller.js`, `web/settings-panel.js` (the `#inCrop` lion's mane option only, lead decision 47), `tools/make-vectors.js`, `tests/vectors/cool-crop.json`, `tests/sim.test.js`, `tests/equipment.test.js`, `tests/web-settings-panel.test.js`, `tests/cycle.test.js` (append), `tests/controller.test.js` (append), `tests/capacity.test.js` (append), `web/room-equipment.js`, `tests/web-room-equipment.test.js`, `docs/superpowers/plans/2026-10-08-farm-foundation/equipment.md` (a byte-for-byte copy of its brief) | C8 revision 2, C7 revision 2, C5 3.12 | The brief's done-when: C8 14 tests pass; the 8 old vectors byte-identical, `cool-crop.json` added (9 vector tests); the C7 default cycle deep-equal to `master` (identity check); REAL1 gives `min` 2, `recommended` 2.5 and the exact first summary line; the card's Node tests pass; after gate 2.5, the card's headless check (C5 7.10, lead decision 49) |
| Server 2 | `stream/server-2` | `server/api.js`, `server/static.js`, `server/rooms.js`, `server/sim-adapter.js`, `room-rules.js`, `tests/api.test.js`, `tests/rooms.test.js`, `tests/room-rules.test.js` | The C1 fake (prep 2.0), C2 revision 8, C3 revision 8, the prep 2.0 `equipment.js` stub | Routes 6.20–6.26, the 6.8 and 6.13 changes, `/cycle.js`, `/equipment.js`, the 18-key ReadingRow, `live.flush` and `live.blocks`, `env.plant` pass against the fakes (C3 12, C2 17); the C2 "Room equipment" test is skipped while `plantOf` throws `stub` and runs at gate 2.5 (lead decision 48) |
| Room shell | `stream/room-shell` | `index.html`, `styles.css` (one appended `/* Room page */` block only), `web/shell.js`, `web/rooms.js`, `tests/web-shell.test.js`, `tests/web-rooms.test.js` | C5 revision 7 (1.2, 1.3, 2, 3.7 import, 3.8, 3.9, the CSS row of 3.8), C3, C4 | The C5 7.10 Room shell row: Node tests now; headless after gate 2.5 |
| Live tab | `stream/room-live` | `web/room-live.js`, `tests/web-room-live.test.js` | C5 3.4, 3.9, 7.9; C6 | The C5 7.10 Live tab row |
| Simulate tab | `stream/room-simulate` | `web/room-simulate.js`, `tests/web-room-simulate.test.js` | C5 3.7 (`sameMix`), 3.9, 3.10, 3.12 (the card's `mount` interface); C3 3.9–3.11, 6.20–6.25; C7; C8 4.5 (`plantOf`) | The C5 7.10 Simulate tab row |
| Calibrate tab | `stream/room-calibrate` | `web/room-calibrate.js`, `web/charts.js` (the C5 6.2 `drawCalibCharts` options only), `tests/web-room-calibrate.test.js`, `tests/web-charts.test.js` (append) | C5 3.6, 3.9, 3.11, 6.2; C3 3.2, 3.6, 6.8, 6.13, 6.20–6.23, 6.25; C8 4.5 | The C5 7.10 Calibrate tab row |
| Bench | `stream/bench` | `web/simulator.js` (the room link, `#/simulator/:id`, the calibration event text and the Node export; not the mimic code), `calib.js`, `tests/web-room-link.test.js`, `tests/calib.test.js` (append) | C5 7.8 (with the revision 7 rules), 2.1; lead decisions 23, 28, 53 | The C5 7.10 Bench row; every existing calib and bench test green |
| Docs | `stream/docs` | `README.md`, `docs/contract.md`, `docs/phase3-plan.md`, `tests/docs.test.js` | All contracts | The README describes the Rooms home, the three tabs, the Test bench, simulation runs, the equipment check, upgrade 2 (a one-time scan of `readings` at the first start) and backups; `tests/docs.test.js` passes |

### 3.1 One owner per file

| File or group | Owner in wave 2 |
|---|---|
| `docs/contracts/*`, the spec, this plan, `docs/research/*`, every brief except the Equipment copy | Lead (prep 2.0) |
| `tests/fakes/db.js`, `tests/fakes/rooms.js`, `tests/fakes/api-server.js`, `tests/fake-db.test.js`, `tests/fake-rooms.test.js`, `tests/fake-api-server.test.js` | Lead (prep 2.0) |
| `web/api.js`, `tests/web-api.test.js`, `web/room-tabs.js`, `tests/web-room-tabs.test.js` | Lead (prep 2.0) |
| `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js` | Lead (prep 2.0 stubs), then the Live tab, Simulate tab and Calibrate tab streams (each replaces its stub) |
| `equipment.js` | Lead (prep 2.0 stub), then Equipment (replaces it) |
| Every file in the "Owns" column of section 3 | That stream only |
| `web/capacity.js`, `web/calibration.js`, `tests/web-load.test.js`, `tests/web-bench.test.js`, `tests/api-real.test.js`, `docs/ROADMAP.md` | Nobody in wave 2; the lead in wave 3 |
| `tests/web-mimic.test.js` and the mimic code of `web/simulator.js` and `styles.css` | The drawing fix outside the streams (section 7); no wave 2 stream touches them |
| Every other file | Nobody (read-only) |

## 4. Rules for every stream

| Rule | Detail |
|---|---|
| Server streams vs web streams | The web streams and the Equipment card need the new routes, the new Reading keys and the real `equipment.js` on a real server for their headless checks. They run those checks after gate 2.5, on a tree that holds the gate 2.5 `master` plus their own changed files (C5 7.10); until then they test in Node against the fake API and the `equipment.js` stub. |
| No merging of `master` | Streams never merge or rebase `master` into their branches; the lead merges. A check tree is built with `git archive` (C5 7.10). |
| `styles.css` | Only the Room shell stream changes it (one appended `/* Room page */` block); C5 3.8 names every class the tabs and the Equipment card use (lead decision 32) |
| Start checks | Every web stream: the C5 1.7 start check. Every stream: `git branch --show-current` is its branch, `npm test` gives `# fail 0` (write down the `# pass` baseline). Equipment also: the brief's start checks (`ls equipment.js docs/contracts/equipment.md`, the stub still in place). |
| Contract questions | A stream that finds a contract gap stops that part and reports to the lead; only the lead changes a contract |
| Git | Keep the configured identity; never change `git config`; plain commit messages with no attribution lines; never commit on `master`; never push |
| Models | Implementers on Sonnet, reviewers on Opus |
| Reviews | Every stream gets a spec-compliance review and a code-quality review before the lead merges it |

## 5. Gate 2.5 (lead, inside wave 2)

| Step | Action | Passes when |
|---|---|---|
| 1 | Merge `stream/data-2` into `master`; `npm test` | Green |
| 2 | Merge `stream/equipment`; `npm test` | Green; 9 vector tests |
| 3 | Merge `stream/server-2`; `npm test` | Green; the C2 "Room equipment" test now runs (not skipped) against the real `plantOf` |
| 4 | Start gate (C3 12.2) with a copy of a version 1 database file: `FARM_HOST=127.0.0.1 FARM_PORT=<free port> FARM_DB=<copy> npm start` | The server prints `Open http://127.0.0.1:<port>`; the file's `schema_version` has row 2; `Room 1` records readings with `ac_fan`, `stage`, `core`; `GET /cycle.js` and `GET /equipment.js` give 200; `SIGINT` exits 0 |
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

### 6.2 Lead work

| Item | Detail |
|---|---|
| Clean-up | Delete `web/capacity.js`, `web/calibration.js` and `FarmBench` (and its tests in `tests/web-bench.test.js`); update `tests/web-load.test.js` (globals `ClimateCycle`, `ClimateEquipment`, `FarmRoomTabs`, `FarmEquipmentCard`; modules `rooms`, `simulator`; tabs `live`, `simulate`, `calibrate`) (lead decision 29) |
| `mimicLayout` | When `fix/room-drawing` is on `master`: add `mimicLayout` to the Node export of `web/simulator.js` next to `createRoomLink`, point `tests/web-mimic.test.js` at `require('../web/simulator.js').mimicLayout`, then delete `FarmBench` (lead decision 51). When it is not yet on `master`: delete `FarmBench` as above, and the fix's author exports `mimicLayout` the same way when merging it (section 7) |
| `tests/api-real.test.js` | Written and run (C3 12.2), with 6.20–6.26 (a small hand-made Result for 6.21) |
| Headless checks | Every C5 7.10 row again through the real room page; the Equipment card inside the Simulate tab (mount, **Check my machines** with a short program, the Saved runs row `Equipment`, **Open**) |
| Start gate | C3 12.2 again on the final merge, with a version 1 database file |
| Roadmap | `docs/ROADMAP.md`: the wave 2 rows marked built |

## 7. The room drawing fix (outside the streams)

| Item | Rule |
|---|---|
| Who | Another developer, on branch `fix/room-drawing` (lead decision 53); not the lead, not prep 2.0, not any wave 2 stream |
| Files it touches | `web/simulator.js` (the mimic: `MIMIC_SVG`, the fan and passive opening placed by `vent`, `inletAt`, `exhaustAt`; the circulation fan `CF-205`), `styles.css` (mimic styles), `tests/web-mimic.test.js` |
| Overlap with wave 2 | `web/simulator.js` is the Bench stream's (room link, event text, Node export) and `styles.css` the Room shell's (one appended block). Neither stream edits the mimic code or the mimic styles, so the changes sit in different parts of the files; whoever merges second resolves the textual conflicts, and the lead checks the result with `npm test` and the Bench headless check |
| `mimicLayout` | Lives in the Node export of `web/simulator.js`, next to `createRoomLink` (lead decision 51; section 6.2) |
| Labels | The calibration label rename (`Heat through walls and roof (W/K)`) is the Bench stream's, not the fix's (lead decision 28) |

## 8. Briefs

| Brief | Fate | Content |
|---|---|---|
| `rooms-ui.md` | Replaced by `room-shell.md` and `room-live.md` | Its pure functions split by user; the frame mechanics, list and CSS to Room shell; the room page rows 2–10 to the Live tab; checks per C5 7.10 |
| `capacity-calibration.md` | Replaced by `room-simulate.md` and `room-calibrate.md`; the import part goes to `room-shell.md` | Helpers `toCapacityMix`, `toMixRows`, `sameMix`, `appliedCalib`, `farmDate`, `readStored`, `importPlan`, `importRooms`, `envBaseFor`, `paramsOfRun`, `startParams`, `defaultBlocks`, `parseBlocks`, `calibBody` and its decisions, updated to C5 3.6–3.11 |
| `simulator-link.md` | Replaced by `bench.md` | The room link unchanged; `#/simulator/:id`; the label and note (lead decision 28); `stage` per row in `calib.js`; no drawing work (lead decision 53) |
| `docs.md` | Rewritten | Same structure and `tests/docs.test.js` approach; content from the amended contracts |
| – | New: `data-2.md`, `server-2.md` | C1 revision 5; C2 revision 8 and C3 revision 8 |
| – | New: `equipment.md` (lead gives it; the stream copies it byte for byte) | The reviewed draft `/home/foqcus/Documents/mushroom-farm-c8/equipment-brief.md` with: the stub check `grep -c "Error('stub')" equipment.js` (not `not installed`); the research paths `docs/research/…`; the texts of tests S-OWNBELOW and S-MARGCOLD (lead decision 45: `It is just enough: it has no reserve for the hottest days, but no bigger size holds this room steadier (2.5 hp is too big).`, no breakdown line in the summary) and S-WET (lead decision 46: `The room is too wet in fruiting 1 (above 95 % RH 24 % of the time).`; lead decision 43: the walls and roof line ends with ` An insulated room also needs drier fresh air.`); new tests for C8 14 rows 7–8 (revision 2); the 584-test baseline |
| `api.md`, `data.md`, `rooms.md`, `web-split.md`, `lead-fakes.md`, `cycle.md` | Kept (waves 0, 1 and the cycle stream: history) | – |

## 9. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| A full cycle is slower in a phone browser (2–3 × Node) | 10–15 s for the default cycle, minutes for long programs; an equipment check 30–60 s | Per-day progress; the 180-day confirm; a server worker later (lead decision 17) |
| History fit of 7 days of raw readings | About 20,000 rows × up to 400 replays in the browser | Default 2 days; the fit already yields to the page (`fitAsync`) |
| Web streams need the new server routes for their real-server checks | Waiting inside wave 2 | Node tests against the fakes and the stub first; gate 2.5 merges Data 2, Equipment and Server 2 early |
| Upgrade 2 scans `readings` once (the `ac_fan` `CHECK`) | A few seconds at the first start on a large file | One-time; the README says so (Docs stream) |
| The drawing fix and the Bench and Room shell streams edit the same files | Textual merge conflicts | Different parts of the files (section 7); `npm test` and the Bench headless check after the merge |
| The Simulate tab's Node tests run without `web/room-equipment.js` | The slot cannot be tested with the real card before gate 2.5 | The slot shows `The machines check is not installed.` without `FarmEquipmentCard` (C5 3.10); the card inside the tab is the lead's wave 3 check |

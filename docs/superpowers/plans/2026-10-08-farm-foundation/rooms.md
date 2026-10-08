# Work brief: Wave 1, Rooms stream

| Item | Value |
|---|---|
| Repo | `/home/foqcus/Documents/mushroom-farm`. You work alone in your own git worktree, on the branch the lead made for it. |
| Spec | `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`, sections 1, 2, 5 and 6 |
| You implement | C2, `docs/contracts/rooms.md` (revision 7). "C2 §x" below points into it. |
| You call | C1, `docs/contracts/db.md` (revision 4), only through the fake db `tests/fakes/db.js`. "C1 §x" points into it. |
| Binding | The lead decisions of section 4.2. They override the contracts; the contracts override this brief. Report any difference (section 10). |

## 1. Goal

Build the room manager (`server/rooms.js`) that runs each room's control loop on the server in real time and records
it, and the simulated adapter (`server/sim-adapter.js`) that wraps `sim.js` for a live room.

| Result | Proved by (Task) |
|---|---|
| Each active room runs `runtime.js` and `controller.js` with an adapter, ticked once per second | Recording, Catch-up, Gap (4) |
| Every reading, controller event, alarm change and settings version is written through C1, then emitted | Recording (4), Alarms (5), Settings at once (10) |
| A room resumes from its saved controller and sim state, with no repeated or invented readings | Resume (6) |
| New settings take effect at once, follow the target, ramp, pair and restore rules, and are stored as a version | Tasks 10, 11, 12, 14 |
| A crashed room stops alone; a database error stops everything with `fatal` | Crash isolation (8), Database error (9) |
| Every row of C2 §17 has a passing test | Section 9 checklist |

## 2. Before you start

| Check | Command | Expected |
|---|---|---|
| Worktree and branch | `git status --short && git branch --show-current` | Clean tree; the lead's branch (not `master`) |
| Commit identity (repo config, never change it) | `git config user.name && git config user.email` | `Ray Tham` and `65101833+rayy1218@users.noreply.github.com` |
| Wave 0 files | `ls docs/contracts/db.md docs/contracts/rooms.md server/db-common.js server/rooms-common.js tests/fakes/db.js tests/fakes/rooms.js` | All six exist. **If one is missing, stop and report to the lead.** Never write them yourself. |
| Node | `node --version` | v22.13 or newer (checked on v22.20) |
| Baseline | `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail)'` | `# fail 0`. Write down `# tests` as **N0** (93 before wave 0; wave 0 adds more). |
| Recorded runs | `node --test tests/vectors.test.js 2>&1 \| grep -E '^# (pass\|fail)'` | `# pass 8`, `# fail 0` |

Read C2 completely before Task 1.

## 3. Files

| File | Access | Content |
|---|---|---|
| `server/sim-adapter.js` | **Owned, new** | C2 §13: `createSimAdapter`, `MAX_CATCH_UP_S`, `TZ_OFFSET_S`, `START_CO2` |
| `server/rooms.js` | **Owned, new** | C2 §1 to §12, §15: `createRoomManager`, `defaultAdapterFactory`, `TARGET_KEYS`, and the four exports of `./rooms-common.js` re-exported as the same objects |
| `tests/rooms.test.js` | **Owned, new** | Every test of section 7, which covers all of C2 §17 |
| `controller.js`, `sim.js`, `runtime.js` | Read only | Require them, then use `globalThis.ClimateController`, `ClimateSim`, `ClimateRuntime` (as `tests/harness.js` does) |
| `server/rooms-common.js` (lead) | Read only | `RoomError`, `DEMO_ROOM`, `FIRST_NOTE`, `cleanSettings` (C2 §6.3) |
| `server/db-common.js` (lead) | Read only | `NotFoundError`, `toJson`, `fromJson` (C1 §5.1). Tests compare saved JSON as `fromJson(toJson(x))`. |
| `tests/fakes/db.js` (lead) | Read only | `openFakeDb({ now })` → the C1 db object (C1 §9) |
| `tests/fakes/rooms.js` (lead) | Read only | `createFakeRoomManager({ db, now })`, for the parity test only (C2 §16) |
| `docs/contract.md` | Read only | Adapter reading and command shapes (sections 1 and 2) |
| `tests/vectors/*.json`, `package.json`, `docs/`, everything else | Read only | The 8 recorded runs stay byte-identical. `npm test` runs `tests/*.test.js`, so your test file is picked up. |

## 4. What you build against

### 4.1 Contract sections

| What | Where | Notes |
|---|---|---|
| Files, exports, loads, rules | C2 §1 | CommonJS, synchronous. `rooms.js` loads only `../controller.js`, `../runtime.js`, `./sim-adapter.js`, `./rooms-common.js`; `sim-adapter.js` only `../sim.js`, `../runtime.js`. Call controller functions as `ClimateController.<name>(…)` at call time, never through a copy taken at load. |
| Options and constants | C2 §3 | `STATE_SAVE_S` 300, `NAME_MAX` 60, volume 5–5000, `NOTE_MAX` 200, `RECENT_READING_S` 3600, `ACK_SCAN` 500, pair gap 50 ppm. Internal: export only the C2 §1 list. |
| Methods | C2 §4 | `start`, `stop`, `tick`, `list`, `get`, `create`, `update`, `archive`, `restart`, `applySettings`, `ackAlarm`, `on`, `off` |
| Shapes | C2 §5 | Room, Live (`targets.RH` rounded to one decimal), ReadingRow (= C1 `Reading`; `fog`/`fan` rounded and held in 0–3), Event, Alarm, SettingsVersion |
| Input rules, `RoomError` | C2 §6 | Exact `details` texts in the C2 §6.1 table |
| Events | C2 §7 | `reading`, `event`, `alarm`, `settings`, `room`, `fatal`, each after its db write. The `room` summary is `{ stage, crop, alarms, running, error }`; a change of only `targets` or `status` emits nothing. |
| Loop | C2 §8 | Loop start (§8.1, with `blocks` from `getMix`), tick and Record (§8.2), state save (§8.4), manager events (§8.5) |
| Settings | C2 §9 | Rules §9.1; `applySettings` steps 1 to 13 §9.2; automatic versions §9.3; first settings §9.4 (always merged over `defaultSettings()` with `roomM3 = volume`) |
| Alarms | C2 §10 | Raise and clear §10.1; `ackAlarm` §10.2 |
| Crashes and db errors | C2 §11 | |
| Adapter and factory | C2 §12 | Factory args `{ room, calib, blocks, cfg, snapshot, now }` |
| Simulated adapter | C2 §13 | Env, `setRoom`, CO₂ jitter `(r.seq % 2) * 1e-6`, time origin, gap |
| Db functions | C2 §15 | Only these 18: `listRooms`, `getRoom`, `createRoom`, `updateRoom`, `archiveRoom`, `currentSettings`, `saveSettings`, `currentCalibration`, `getMix`, `loadControllerState`, `saveControllerState`, `insertReading`, `queryReadings`, `addEvent`, `listAlarms`, `raiseAlarm`, `clearAlarm`, `ackAlarm`. Never `getSettingsVersion` or `latestReading`. Tests may call any C1 function. |
| Db errors | C1 §6.1, §9.2 | Recognise `NotFoundError` by `err.code === 'NOT_FOUND'`. The fake's error table gives the "Disk I/O error" value to throw in tests. |
| Required tests | C2 §17 | Each row maps to a test in section 7 (the "C2 §17 row" column) |

### 4.2 Lead decisions that bind you

| # | Decision, as it applies to you |
|---|---|
| 1 | One set of Reading keys everywhere: `room_id`, `t`, `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_mode`, `ac_setpoint`, `fog`, `fan`, `lights`, `circ`, `power_w`, `kwh`. You build rows with these keys and pass them on unchanged. Never use `temp`, `rh`, `co2`, `n`. |
| 2 | C2 owns every `room` event: lifecycle (create, update, archive, restart, crash, each room started) and summary changes (end of a tick, of `applySettings`, of `ackAlarm`). C3 only relays them. |
| 3 | The fake db throws constraint errors with `code: 'ERR_SQLITE_ERROR'` and node:sqlite's `errcode`. C2 does not look at codes: any error from a db function during a tick is `fatal`. |
| 6 | Settings from outside are never passed to `ClimateController.applySettings`. They go through `cleanSettings`, then `ClimateController.importSettings`; only the `importSettings` result is applied (into the live `cfg`) and stored. |
| 7 | The lead wrote the fakes and the `*-common.js` files. You import from them and never change them. |

## 5. Facts about the existing code (checked on Node 22.20)

| Fact | Where |
|---|---|
| `createRuntime({ io, ctl, onReading, skipCurrent })`: `poll()` returns `true` only for a new `seq` and calls `onReading(r, cmd)` inside `poll`. `runtime.reading` is the last reading fed. | `runtime.js` |
| `simIO(sim).advance(dt)` does nothing until `write(cmd)` was called once. | `runtime.js` |
| `ClimateSim.create(env, snapshot)` keeps `env` by reference; weather and `hour` read `env.startHour` live, so resetting it after a gap works. A new sim samples at sim `t = 0` (`seq` 1), then every 30 s; `setRoom` clears the sample. `power` and `kwh` have keys `ac`, `hu`, `fan`, `lights`, `circ`. | `sim.js` |
| `TARGET_KEYS` = `['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff', 'rules.acOff', 'rules.acOn']` | `controller.js` `RAMP_KEYS` |
| Ramps round `spT` to 0.1, `spRH` to 1, the others to 10 ppm. `setStage`, `setCrop`, `setFarmType` write a `Stage: …` event and start a ramp of `program.rampH` hours (none when 0); `ctl.state.stage.ramp` is `{ from, to, t0, dur }` or `null`. | `controller.js` |
| Defaults: oyster, fruiting, farm type `full`, `spT` 25, `spRH` 88, `co2Lim` 1000, `rules.fanOn`/`fanOff` 900/700, `rules.acOff`/`acOn` 900/700, `rampH` 4, `auto` false, `humMode: 'vpd'`, `roomM3` 60. Harvest windows 06:30–09:00 and 14:30–17:00 farm time. | `controller.js` |
| Profiles: oyster pinning `spT` 24; oyster rest `spT` 25, `co2Lim` 2000; golden pinning `rules.fanOn`/`fanOff` 600/450, `acOff`/`acOn` 600/450. `STAGES.pinning` = `Pinning`, `STAGES.rest` = `Rest between flushes`. | `controller.js` |
| From defaults, `applySettings({ crop: 'golden', stage: 'pinning' })` then a reading 14256 s later (f = 0.99) gives live `rules.fanOn` 600, `rules.fanOff` 450, ramp still running. | Controller alone |
| `RH: null` for 3 readings raises `sensor_RH` (`serious`, label `Room humidity sensor fault: no reading`, event `Alarm: Room humidity sensor fault: no reading`) at the third. One good reading clears it (event `Cleared: Room humidity sensor`, `good`); it stays in `alarmList()` with `active: false` until `ctl.ack(id)`, which removes inactive alarms. | `controller.js` |
| `importSettings` warnings: `"spT" = 99 is outside 10–35: set to 35.`, `Unknown setting "bogus" is ignored.`, `"spRH" = 120 is outside 40–99: set to 99.` | `controller.js` |
| `manual.hu = { auto: false, level: 1.5 }` gives `cmd.hu.level` 1.5; `rules.baseFan.fruiting` 5 with `rules.rhLock` false gives `cmd.fan.level` 5 (hence the C2 §5.3 clamp). | Sim and controller |
| Without the CO₂ jitter, `manual.circ = { auto: false, on: true }` raises a false `sensor_CO2` "value does not change (frozen)" alarm at about 6.3 h; with it, none in 12 h (about 0.3 s of CPU). | Sim and controller |
| In VPD mode `ctl.state.rhT` is an unrounded float (for example 88.0196…). | `controller.js` |

## 6. Test tools (inside `tests/rooms.test.js`)

| Helper | Definition |
|---|---|
| Fake clock | `T0 = 1791424800` (2026-10-08 10:00 farm time, outside the harvest windows). Each test has its own `clock` and `now = () => clock`. |
| Setup | `db = openFakeDb({ now })`; `mgr = createRoomManager({ db, now, tickMs: 0, adapterFactory })`; record every emit: `for (const n of ['reading','event','alarm','settings','room','fatal']) mgr.on(n, p => log.push([n, p]))`. |
| `step(n)` | `n` times `{ clock += 1; mgr.tick(); }` |
| `jump(s)` | `clock += s; mgr.tick()` (a catch-up when `s` ≤ 300, a gap when `s` > 300) |
| Sim spy factory | `args => { const a = createSimAdapter(args); const w = a.io.write; a.io.write = c => { writes.push(c); w(c); }; made.push({ args, a }); return a; }`: the live `cfg` (`made[i].args.cfg`), the commands (`writes`), the plant (`made[i].a.view()`). |
| Scripted factory | Below: deterministic and cheap, for long clock jumps without physics. |

```js
// One reading per 30 s of adapter time; adapter time follows dt, so it equals now().
// Values follow the live cfg with a small wobble, so no frozen-sensor fault occurs.
function scripted() {
  const knobs = { failRead: false, values: {}, reads: 0 };   // values: { RH: null } forces a sensor fault
  const factory = ({ cfg, snapshot, now }) => {
    let t = now(), seq = snapshot ? snapshot.seq : 0, next = 0, r = null;
    const sample = () => {
      const w = ++seq % 2, v = knobs.values;
      r = { seq, t, hour: ((t + 28800) % 86400) / 3600,
        T: 'T' in v ? v.T : cfg.spT + w * 0.1, RH: 'RH' in v ? v.RH : cfg.spRH + w * 0.5,
        CO2: 'CO2' in v ? v.CO2 : cfg.co2Lim - 200 + w * 10, tOut: 30 + w * 0.1, rhOut: 70 + w * 0.5 };
      next = t + 30;
    };
    sample();
    return {
      io: { read() { knobs.reads++; if (knobs.failRead) throw new Error('sensor bus down'); return r; },
            write() {}, advance(dt) { if (dt <= 0) return; t += dt; if (t >= next) sample(); } },
      view: () => null, snapshot: () => ({ seq }),
    };
  };
  return { factory, knobs };
}
```

`rooms.js` has no test hooks. Tests observe the live `cfg` through the factory's `args.cfg`; controller state (ramp,
alarms, `acked`) through `db.loadControllerState(id).controller` after an operation that saves state (fresh start,
`applySettings` or `ackAlarm` on a running room, `stop()`, `restart`, the 300 s save); rows through the C1 read
functions; live status through `mgr.get(id).live` and the payloads in `log`.

## 7. Tasks

Every task follows the same loop:

| Step | Do |
|---|---|
| a | Write the task's tests in `tests/rooms.test.js`. |
| b | `node --test tests/rooms.test.js`: the new tests fail for the expected reason (missing export or wrong value), not a syntax error. |
| c | Write the least code that passes them, following the cited C2 sections. |
| d | `node --test tests/rooms.test.js`: all pass. |
| e | `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail)'`: `# fail 0`. |
| f | `git status --short`: only owned files changed. Commit with the task's message, ending with the attribution trailer your session gives. Do not push. |

### Task 1: Simulated adapter (C2 §13, §12.1) — `feat(server): simulated room adapter on real time`

| Test | Proves |
|---|---|
| `sim adapter: constants` | `MAX_CATCH_UP_S === 300`, `TZ_OFFSET_S === 28800`, `START_CO2 === 750` |
| `sim adapter: env` | Wrap `globalThis.ClimateSim.create` to capture `env` (restore in `t.after`). Room `{ id: 1, volume: 80, vent: 'exhaust', adapter: 'sim' }`, calib `{ ua: 90, infAch: 0.4, moistBuffer: 3, co2PerBlock: 41.6 }`, `blocks: 500`, `cfg.stage = 'pinning'`: `vent: 'exhaust'`, `room: { volume: 80, ua: 90, infAch: 0.4, moistBuffer: 3 }`, `co2PerBlock: 42`, `blocks: 500`, `blockStage: 'pinning'`, `startHour === ((now() + 28800) % 86400) / 3600`, every other key equal to `DEFAULT_ENV`. With `calib: null, blocks: null`: `room: { volume: 80 }`, `co2PerBlock: 45`, `blocks: 2000`. `DEFAULT_ENV` is unchanged. |
| `sim adapter: new room at its targets` | No snapshot: `read().t === now()`, `read().hour === 10` at `T0`, `view().T === cfg.spT`, `view().CO2 === 750` |
| `sim adapter: one reading per 30 s` | After `write(cmd)` and 30 × `advance(1)` (clock moved with it): a new `seq`, `t === T0 + 30`. A `cfg.stage` change between steps shows in the captured `env.blockStage` after the next step. |
| `sim adapter: CO₂ jitter` | With the captured sim: odd `seq` → `read().CO2 === sim.read().CO2 + 1e-6`; even `seq` → equal. With the captured `env.faults.CO2 = 'missing'`, the next reading has `CO2: null`. |
| `sim adapter: gap` | `advance(301)` with the clock moved 301 s: `view().t === now()`, `read().seq` unchanged. `advance(0)` and `advance(-5)` change nothing. |
| `sim adapter: resume from a snapshot` | `snap = fromJson(toJson(a.snapshot()))`; an adapter made from it 600 s later has the old `view()` `T`, `RH`, `CO2`, `view().t === now()`, the same `read().seq` and a later `read().t`. `snapshot()` equals `sim.snapshot()`. |

### Task 2: Module surface, listeners, factory (C2 §1, §3, §7, §12.2) — `feat(server): room manager skeleton, events and adapter factory`

| Test | Proves |
|---|---|
| `rooms: exports` | `createRoomManager`, `defaultAdapterFactory`, `TARGET_KEYS` (section 5 order); `RoomError`, `DEMO_ROOM`, `FIRST_NOTE`, `cleanSettings` are `===` those of `rooms-common.js`. Requiring `rooms.js` loads no `node:sqlite` and no `server/db.js`. |
| `rooms: defaultAdapterFactory` | `adapter: 'sim'` → an object with `io.read`, `io.write`, `io.advance`, `view`, `snapshot`; `adapter: 'hw'` throws `Error('Unknown adapter "hw"')` |
| `rooms: listeners` | Order added; `off` removes one; a throwing listener is caught, `console.error` is called (stub and restore it), the next listener runs |
| `rooms: nothing before start` | `createRoomManager` and a `tick()` before `start()` make no db call (count calls on the fake) |

### Task 3: `create` and the demo room (C2 §4, §6.1, §9.4, §8.5) — `feat(server): create rooms and the demo room`

| Test | Proves (C2 §17 row) |
|---|---|
| `Demo room` | `start()` on an empty db creates `Room 1` (60 m³, `supply`, `adapter: 'sim'`) with one version: note `Created`, `defaultSettings()` with `roomM3` 60. A second manager's `start()` on the same db creates nothing. (Demo room) |
| `First settings` | Key left out, and `settings: undefined`: one version, note `Created`, `defaultSettings()` with `roomM3 = volume`, `warnings: []`; on a manager not started, emits `settings` (`auto: false`, `version` deep-equal to `db.currentSettings(id)`, `warnings: []`), then `event` `Room created` (`info`, `t = now()`), then `room` last. `{ spT: 99, bogus: 1 }`: `spT` 35 and both `importSettings` warnings. `{ crop: 'pink' }` with volume 200: `roomM3` 200 and `crop` `pink` (merged over the base). `{ roomM3: 150 }`: `roomM3` 150. The name is stored trimmed. (First settings) |
| `Errors: create input` | Each C2 §6.1 rule with its exact text: name empty or 61 characters; volume 4.9, `NaN`, a string; vent `'side'`; settings `[]`, `null`, `5`. Several broken rules give all texts, in table order. Each error: `name 'RoomError'`, `code 'bad_input'`, `message 'Bad input'`, `instanceof` the `rooms-common.js` class. Nothing stored. |

### Task 4: Loop start (fresh), tick, Record, state save (C2 §8.1 fresh path, §8.2–§8.4, §5.2, §5.3) — `feat(server): room loops record readings and save state`

| Test | Proves (C2 §17 row) |
|---|---|
| `Recording` | Sim spy factory. `start()` writes one row at `T0`, events `Started` and a state save (`saved_at === T0`, `sim` not null). `step(30)` adds exactly one row at `T0 + 30`, with exactly the 15 keys of decision 1 (`room_id` = id), commands matching the last `writes` entry by C2 §5.3, `power_w`/`kwh` = sums of `power`/`kwh`. The `reading` payload is `{ roomId, live }` with `live.reading` deep-equal to `db.latestReading(id)`. `get(id).live`: `running: true`, `error: null`, `stage: 'fruiting'`, `crop: 'oyster'`, `targets: { T: 25, RH: <number>, CO2: 1000 }`, `status.T/RH/CO2` each `{ lvl, icon, text }`. Controller events become rows. (Recording) |
| `Rounded humidity target` | After `step(90)`: `x = live.targets.RH` has `Math.abs(x * 10 - Math.round(x * 10)) < 1e-9`. A room created with `{ humMode: 'rh' }`: `targets.RH === 88`. (Rounded humidity target) |
| `Catch-up` | `jump(300)` records 10 rows, 30 s apart, the last at `now()`. (Catch-up) |
| `Gap` | `jump(301)` records no row; within 30 more `step(1)`, one row with `t` above the previous row's and ≤ `now()`. (Gap) |
| `Periodic save` | `saved_at` is `T0` after start, still `T0` after `step(299)`, `T0 + 300` after one more. (Periodic save) |
| `Block count` | Spy factory. Before `start()`: room A gets `db.replaceMix(id, [{ crop: 'oyster', blocks: 300 }, { crop: 'golden', blocks: 200 }])`, room B no mix, room C a mix of 0 blocks. Factory args: A `blocks: 500`, B and C `blocks: null`. (Block count) |
| `list and get` | `list()` = non-archived rooms by id, each with `live`. `get(1.5)`, `get('1')`, `get(999)` → `null`. |
| `create on a started manager` | Emits `settings`, `event` `Room created`, `event` `Started`, `reading`, then `room` last; the room records on later ticks. |

Record runs after `runtime.poll()` returns `true`, never inside `onReading` (which only keeps `r` and `cmd`); Task 8
relies on this. Copy with `structuredClone`; never replace the live `cfg` object.

### Task 5: Controller events and alarms (C2 §10, §8.2 Record b and c) — `feat(server): record controller events and alarm rows`

| Test | Proves (C2 §17 row) |
|---|---|
| `Alarms` | Scripted. `knobs.values = { RH: null }`, 3 readings: one `alarms` row `sensor_RH`, `serious`, the label, `raised_at` = third reading's `t`; emit `alarm` `'raised'` with that row; event row `Alarm: …` at that `t`, `serious`; `live.alarms === 1`. `values = {}`, next reading: `cleared_at` = its `t`, emit `'cleared'`, `live.alarms === 0`. `ackAlarm(id, 'sensor_RH')` returns the row with `acked_at === now()`, emits one `'acked'` and the event `Acknowledged: Room humidity sensor fault: no reading`. A second `ackAlarm` returns the same row and emits nothing. (Alarms) |
| `Alarms: ack every unacknowledged row` | Raise, clear, raise again: `ackAlarm` emits 2 `'acked'` and returns the newer row. |
| `Alarms: bad keys` | `ackAlarm(id, 'nope')` → `not_found`, `No alarm "nope" in room <id>`, `details: []`; `''` and `5` → `bad_input` `alarmKey must be a non-empty string`; `ackAlarm(999, 'x')` → `not_found` `Room 999 not found`. |
| `Alarms: state saved after ack` | Running room with an active alarm: after `ackAlarm`, `loadControllerState(id).controller.alarms.sensor_RH.acked === true`. |
| `No frozen CO₂` | Default factory, room created with `{ manual: { circ: { auto: false, on: true } } }`, 144 × `jump(300)` (12 h): no `alarms` row `sensor_CO2`, no event containing `value does not change (frozen)`. (No frozen CO₂) |

### Task 6: `stop()` and resume (C2 §4 `stop`, §8.1 resumed path) — `feat(server): stop and resume rooms from saved state`

| Test | Proves (C2 §17 row) |
|---|---|
| `Resume: sim room` | Spy factory. Run 90 s, `stop()`: state save at `now()`, event `Stopped`, no `room` emit, later `tick()` does nothing. Clock + 600; a second manager's `start()`: event `Resumed after 10 min stopped`; no new row at start; `live.reading` deep-equal to `db.latestReading(id)`; the new adapter's `view()` `T`, `RH`, `CO2` equal the old one's at stop; after `step(30)` one new row with `t` above all earlier; `live.stage` unchanged. (Resume) |
| `Resume: alarms carry on` | Scripted, active `sensor_RH` at `stop()`, `RH` still `null` after resume: no second row, no `'raised'`, `live.alarms === 1` right after `start()`. |
| `Resume: alarm cleared while stopped` | As above with `RH` good after resume: the first reading clears the open row (`'cleared'`). |
| `One reading shape` | With a reading less than 3600 s old: after the second `start()`, `live.reading` is the newest row of `queryReadings` and has the keys of a Record row. With none in the last hour: `null`. (One reading shape) |

### Task 7: Room summary (C2 §7 `room` rules, §8.2 step 4) — `feat(server): room summary events`

| Test | Proves (C2 §17 row) |
|---|---|
| `Room summary` | Scripted. `step(1)` with no new reading, and `step(30)` with no change: no `room`. An alarm raise (Task 5 recipe) emits `room` once, at that tick, with `live.alarms === 1`. Created with `{ program: { auto: true, days: { fruiting: 1 } } }`: `jump(86400)` emits `room` once with `live.stage === 'rest'`; then `step(300)` moves `live.targets.CO2` along the ramp (1000 to 2000) and emits no `room`. `knobs.values.T = 26.5` (status `T` from `In band` to `Above band`): no `room`. (Room summary) |

### Task 8: Crashes, `restart`, ack while crashed (C2 §11, §4 `restart`, §8.1 "On error" and step 5) — `feat(server): isolate crashed rooms; restart`

| Test | Proves (C2 §17 row) |
|---|---|
| `Crash isolation` | Two scripted rooms. Room A `failRead = true`, `step(1)`: A `running: false`, `error: 'sensor bus down'`; event `Stopped by an error: sensor bus down` (`serious`); `room` emitted for A; A's `saved_at` unchanged. After `step(30)` B has a new row, A none. (Crash isolation) |
| `Crash at loop start` | A room inserted with `db.createRoom({ …, adapter: 'hw', settings: defaultSettings() })` before `start()`: stopped with `error: 'Unknown adapter "hw"'`, `live.stage: 'fruiting'`, `targets: null`, `status: null`, event `Stopped by an error: Unknown adapter "hw"`; other rooms start and record. |
| `Restart` | Crashed room (`failRead` cleared): `restart(id)` → `running: true`, `error: null`, resumed from the last save, `room` emitted, no `Stopped`. Running room: state save, `Stopped`, then `Resumed after 0 min stopped`. Archived → `bad_input` `room <id> is archived`; unknown id → `not_found`. |
| `Ack while crashed` | Scripted. Raise `sensor_RH` (keep `RH: null`), `jump` until a periodic save stores it, crash the room. `ackAlarm` sets `acked_at` and saves no state. Clear `failRead`, `restart(id)`, `stop()`: `loadControllerState(id).controller.alarms.sensor_RH.acked === true`. (Ack while crashed) |

In a tick, only the adapter and controller calls (`io.advance`, `runtime.poll`) sit in the try that crashes a room;
Record and the state save run outside it. In loop start, steps 2 to 6 are in that try; steps 1 and 7 are not.

### Task 9: Database errors and the timer (C2 §11, §3 `tickMs`) — `feat(server): stop all loops on a database error; tick timer`

| Test | Proves (C2 §17 row) |
|---|---|
| `Database error` | `db.insertReading` replaced by one throwing `Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10, errstr: 'disk I/O error' })`: the recording tick emits `fatal` once with `{ error }` the same object; later `tick()` calls do nothing (`knobs.reads` unchanged, no emit). (Database error) |
| `Database error in a method` | A throwing `db.saveSettings` makes `applySettings` throw that error (not a `RoomError`); no `fatal`. |
| `Timer` | `tickMs: 10`, scripted: `knobs.reads` grows within 100 ms of `start()`; stops growing after `stop()`; the timer also stops after a `fatal`. The test process exits. |

### Task 10: `applySettings` basics (C2 §9.1, §9.2 steps 1–4 and 10–13) — `feat(server): apply settings to a running room`

| Test | Proves (C2 §17 row) |
|---|---|
| `Settings at once` | Spy factory. At `T0 + 600`, `applySettings(id, { spT: 20 }, '  colder  ')` returns `{ settings, warnings: [], version }` with `version.note === 'colder'`, `settings.spT === 20`; `made[0].args.cfg` is the same object with `spT` 20; the next row's `ac_setpoint` is 20 (was 25); event `Settings saved (version <id>): colder`; state saved at `now()`; `settings` emit with `auto: false`, `warnings: []`. (Settings at once) |
| `Partial merge` | `applySettings(id, { spT: 20 })`: the stored version equals the previous one except `spT`. `cleanSettings(s, base)` shares no object with `s` or `base`. (Partial merge) |
| `Whole machine levels` | Default factory. Room A `{ manual: { hu: { auto: false, level: 1.5 } } }`, room B `{ rules: { baseFan: { fruiting: 5 }, rhLock: false } }`: both keep recording, A's rows have `fog` 2, B's `fan` 3, no `fatal`. (Whole machine levels) |
| `Settings: warnings and stopped rooms` | `{ spRH: 120 }` returns its warning and stores 99. A crashed room stores the version (`stored = next`) with no state save. 201-character note → `note must be text of at most 200 characters`; `null` or `[]` → `settings must be an object`; archived → `bad_input`; unknown id → `not_found`; nothing stored on an error. A note of spaces stores `null`. |

### Task 11: Targets, stages, ramps, automatic versions (C2 §9.2 steps 5, 6, 8, 9, §9.3) — `feat(server): settings follow the stage program and ramps`

| Test | Proves (C2 §17 row) |
|---|---|
| `Settings rules` | Scripted, defaults. (1) `{ stage: 'pinning' }` starts a ramp (`ramp.to.spT === 24`); the version has `stage: 'pinning'` and the targets at the ramp's start. (2) `jump(3600)`, `{ offsets: { T: 0.5 } }`: the ramp still runs. (3) `jump(1800)`, `{ spT: 20 }`: `cfg.spT === 20`, the other 7 target keys equal their live values just before, `ramp === null`. (4) New room: `{ stage: 'pinning' }`, `jump(4 * 3600 + 30)`: a version with note `Automatic: targets for Pinning reached`, its event, a `settings` emit (`auto: true`, `warnings: []`) and a state save. (Settings rules) |
| `Automatic stage version` | `program.auto` with `days.fruiting` 1: `jump(86400)` stores `Automatic: stage Rest between flushes`; later readings during the ramp store none. |
| `Crop and farm type` | `{ crop: 'pink' }` calls `setCrop` (its `Stage: …` event written at the end of `applySettings`); `{ farmType: 'ready', stage: 'fruiting' }` calls `setFarmType`. |

### Task 12: Pair corrections (C2 §9.2 step 7) — `feat(server): keep CO2 pairs apart after a partial target edit`

| Test | Proves (C2 §17 row) |
|---|---|
| `Pair correction` | Scripted, defaults. `{ crop: 'golden', stage: 'pinning' }`, `jump(14256)`, then `{ rules: { fanOff: 800 } }`: `cfg` and the version have `rules.fanOff` 550 and `rules.fanOn` 600; `warnings` contains exactly `"rules.fanOff" = 800 must be at least 50 ppm below "rules.fanOn" (600 now): set to 550.`; `importSettings` of the version gives no pair warning. (Pair correction) |
| `Pair correction, high key` | Same setup, `{ rules: { acOff: 450 } }` (live `acOn` 450): `acOff` 500, warning `"rules.acOff" = 450 must be at least 50 ppm above "rules.acOn" (450 now): set to 500.` |

### Task 13: `update` and `archive` (C2 §4, §6.1) — `feat(server): update and archive rooms`

| Test | Proves |
|---|---|
| `update` | A name change stores the trimmed name, emits `room` once, no restart. A `volume` or `vent` change on a running room restarts it (`Stopped`, `Resumed after 0 min stopped`; the new adapter's `args.room.volume` is the new value), emits `room` once, leaves `roomM3` alone. Unknown key → `bad_input` `unknown field "archived_at"`; bad values → C2 §6.1 texts; archived → `room <id> is archived`; unknown id → `not_found`. |
| `archive` | Running room: state save, `Stopped`, `Room archived`, `archived_at === now()`, `room` emit with `live: null`; then out of `list()`, `get(id).live === null`, not ticked. Again: unchanged, no emit. Crashed room: no state save. Unknown id → `not_found`. |

### Task 14: Restore, untrusted keys, error sweep, fake parity (C2 §9.2 `exact`, §6.2, §6.3, §16) — `feat(server): exact restore and untrusted settings keys; parity tests`

| Test | Proves (C2 §17 row) |
|---|---|
| `Restore exact` | `A = applySettings(id, { spT: 23 }).version`. Case 1: `{ stage: 'pinning' }`. Case 2 (new room): `{ stage: 'pinning', program: { rampH: 0 } }`. Both: `applySettings(id, A.settings, 'Restored version <A.id>', { exact: true })` stores a version deep-equal to `A.settings` with that note; `cfg` has stage `fruiting` and A's 8 target values; saved `stage.ramp === null`; the event `Targets restored: …` comes after the `Stage: …` event. Case 1 without `exact`: `ramp.to.spT === 25`, no `Targets restored`. `{ exact: 'yes' }` acts as no `exact`. (Restore exact) |
| `Untrusted keys` | `s = JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":{"x":1}},"spT":20}')`. `applySettings(id, s)` and `create({ name, volume, vent, settings: s })`: `({}).polluted === undefined`, `Object.getOwnPropertyNames(Object.prototype)` unchanged, `spT` 20 applied, warnings include `Setting "__proto__" is not allowed: ignored.` and `Setting "rules.constructor" is not allowed: ignored.`, `s` unchanged. With `ClimateController.importSettings` and `.applySettings` wrapped by spies (restored in `t.after`), every second argument of `applySettings` is `===` a `settings` object `importSettings` returned. (Untrusted keys) |
| `Errors` | `update`, `archive`, `restart`, `applySettings`, `ackAlarm` with an unknown id, `'1'` or `1.5` → `not_found`, `Room <id> not found`, `details: []`; each error is `instanceof` the `rooms-common.js` class and the `rooms.js` re-export. (Errors) |
| `Fake parity` | `createFakeRoomManager({ db, now })`: `create` then `db.currentSettings` (note `Created`); `applySettings` then `db.settingsHistory` (2 rows); `archive` then `db.getRoom(id).archived_at === now()`; `setLive(id, { running: false, error: 'boom' })` changes `get(id).live`; a `__proto__` body leaves `Object.prototype` unchanged; its errors are `instanceof` the same `RoomError`. (Fake parity) |

## 8. How to verify (after Task 14)

| Check | Command | Expected |
|---|---|---|
| Rooms tests | `node --test tests/rooms.test.js 2>&1 \| grep -E '^# (tests\|pass\|fail\|duration)'` | `# fail 0`, under 20 s |
| Whole suite | `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail)'` | `# fail 0`; `# tests` = N0 + your tests |
| Recorded runs | `node --test tests/vectors.test.js 2>&1 \| grep -E '^# (pass\|fail)'` and `git diff --exit-code $(git merge-base HEAD master) -- tests/vectors` | `# pass 8`, `# fail 0`; no diff |
| Only owned files | `git diff --name-only $(git merge-base HEAD master)` | Exactly `server/rooms.js`, `server/sim-adapter.js`, `tests/rooms.test.js` |
| Requires | `grep -n "require(" server/rooms.js server/sim-adapter.js` | Only the C2 §1 files |
| No copied controller functions | `grep -nE "\}\s*=\s*(globalThis\.)?ClimateController" server/rooms.js` | No output (no destructuring of `ClimateController`) |
| Forbidden db calls | `grep -nE "getSettingsVersion\|latestReading" server/rooms.js` | No output |
| No other key names | `grep -nE "\b(temp\|rh\|co2)\s*:" server/rooms.js server/sim-adapter.js` | No output |
| Clock | `grep -n "Date.now" server/rooms.js server/sim-adapter.js` | Only the default `now` in `rooms.js` |
| Clean tree | `git status --short` | Empty |

## 9. Done when

- [ ] Every C2 §17 row has a passing test named with its "Proves" word, plus the other tests of section 7.
- [ ] `server/sim-adapter.js` follows C2 §13 exactly (env with `blocks`, `setRoom`, CO₂ jitter, time origin, gap, members, constants).
- [ ] `server/rooms.js` exports exactly the C2 §1 list; the four re-exports are the same objects.
- [ ] Methods, payloads, event texts, `details` texts and step order match C2 §4 to §12.
- [ ] Only the 18 C1 functions of C2 §15 are called, with C1's arguments.
- [ ] Every section 8 check gives its expected result: `npm test` green, the 8 recorded runs unchanged.
- [ ] One commit per task on your branch, with the attribution trailer; nothing pushed.
- [ ] The final report (section 11) is sent to the lead.

## 10. Do not, and contract gaps

| Do not | Why |
|---|---|
| Touch any file outside the three owned files (shared modules, fakes, `*-common.js`, contracts, `package.json`, README, vectors) | File ownership (spec section 6) |
| Create `server/db.js`, use `node:sqlite`, write HTTP or stream code | Data and API streams' work |
| Add exports, test hooks or debug getters; return Promises or use `async` | C2 §1 is the frozen surface; every method is synchronous |
| Record inside `onReading`, or catch a db error and carry on | A db error in a tick is `fatal` (C2 §11) |
| Save a crashed room's state; invent readings for a gap; simulate more than 300 s in one tick | C2 §8.4, §11, §8.1 step 6b, §13.1 |
| Replace the live `cfg`; pass outside settings to `ClimateController.applySettings` | Decision 6, C2 §9.1 |
| Add npm dependencies or a build step; push, merge, rebase or change git config | Spec decision; the lead merges |
| Change a contract, or settle a gap silently | Use the interim behaviour below and report it |

| Gap | Interim behaviour |
|---|---|
| C1 §7 still says C2 does not call `getMix`; C2 revision 6 (§8.1 step 3, §15) calls it | Follow C2 (the fake has `getMix`, C1 §6.11). Report it. |
| Unknown keys in `create`'s input (C2 §6.1 silent) | Ignore them; pass only `name`, `volume`, `vent`, settings to `db.createRoom`. |
| `create(input)` with a non-object `input` | Treat as `{}` (gives the `name`, `volume`, `vent` errors). |
| `update(id, changes)` with a non-object `changes` | `bad_input`, `['changes must be an object']` |
| `update` on an archived room with bad fields | Room check (`not_found`), then archived (only `room <id> is archived`), then fields. |
| `restart(id)` before `start()`, after `stop()` or after `fatal` | Start no loop; return `get(id)` and emit `room`. |
| `get(id).live` for a room not loaded (before `start()`) | `{ reading: null, stage: null, crop: null, targets: null, status: null, alarms: 0, running: false, error: null }` |

Write down any other silence, contradiction or mismatch with the shared code, with your interim choice. Stop only if a gap blocks a C2 §17 test.

## 11. Final report to the lead

| Item | Content |
|---|---|
| Commits | `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | Section 8 outputs: rooms tests, whole suite (N0 → new count), recorded runs |
| Contract gaps | Each gap of section 10 you hit, plus new ones, with your interim choice |
| Deviations and risks | Anything that differs from this brief and why (should be none); timing-sensitive tests; fake db behaviour that differs from C1 |

# Contract C9: air exchange with short, powerful CO₂ purges

Revision 1, 2026-10-08. Status: frozen (lead decision 55), 2026-10-09. Decisions 14–54 are reserved by the parked wave 2 branch `wave2/contracts-folded`. Design: `docs/superpowers/specs/2026-10-08-air-exchange-purge-design.md`.

C9 replaces the one fresh-air fan (levels 0–3, `env.vent`, `rules.airMode`, AC setback during a purge) with an intake fan and an exhaust fan that switch on and off together. Where C9 and an older contract disagree, C9 wins; section 10 lists every overridden section.

## 1. Words

| Word | Meaning |
|---|---|
| Air exchange | Intake fan `SF-203` (filtered) and exhaust fan `EF-206`, each with a motorised damper. Both on or both off. |
| `air.on` | The command for the air exchange (`true` = both fans on, dampers open) |
| Purge | A run of the air exchange started by CO₂ (state `purge`, 5.3) |
| Air run | Any run of the air exchange: a purge, a safety run, a timed purge, free cooling, outdoor drying or manual |
| Start level / stop level | `rules.fanOn` / `rules.fanOff` (ppm). The keys keep their names. |
| Time cap | `rules.purgeMaxS`: the longest a purge may run |
| Size | `air_m3h`: the airflow of the pair when on (m³/h) |

## 2. Files and owners

| File | Owner | Change |
|---|---|---|
| `air.js` | Lead (step 0) | New: `ClimateAir` (section 3) |
| `tests/air.test.js` | Lead (step 0) | New |
| `docs/contracts/air.md`, `docs/contract.md`, `docs/contracts/LEAD-DECISIONS.md` | Lead | This contract; lead decision 55 |
| `sim.js`, `capacity.js`, `cycle.js`, `calib.js`, `tools/run-headless.js`, `tests/capacity.test.js`, `tests/cycle.test.js`, `tests/calib.test.js` | Simulation stream | Sections 4, 8 |
| `controller.js`, `tests/controller.test.js`, `tests/settings.test.js`, `tests/vectors.test.js` (pack only), `tools/make-vectors.js` | Controller stream | Sections 5, 9 |
| `server/db.js`, `server/rooms.js`, `server/rooms-common.js`, `server/sim-adapter.js`, `server/api.js`, `room-rules.js`, `tests/fakes/**`, `tests/db.test.js`, `tests/fake-db.test.js`, `tests/rooms.test.js`, `tests/fake-rooms.test.js`, `tests/rooms-common.test.js`, `tests/api.test.js`, `tests/stream.test.js`, `tests/room-rules.test.js` | Data stream | Section 6 |
| `web/**`, `styles.css`, `tests/web-*.test.js`, `tests/settings-diff.test.js` | Web stream | Section 7 |
| `index.html`, `server/static.js` (+ its test row in `tests/api.test.js`) | Lead (step 0) | One script line (section 7); the static route `/air.js` (C3 section 9) |
| `tests/integration.test.js`, `tests/harness.js`, `tests/vectors/*.json` | Lead (step 2) | Section 11 |

No stream edits a file it does not own. A stream that needs a change elsewhere stops and reports to the lead.

## 3. `air.js`: `ClimateAir`

A pure module in the style of `capacity.js`: an IIFE that sets `global.ClimateAir` (frozen). No dependencies. Loaded before `controller.js` in `index.html` and required before `controller.js` by every Node module that runs a controller loop or the capacity check (`server/rooms.js`, `server/sim-adapter.js`, `tests/fakes/rooms.js` when it builds controllers, `tools/*.js`, tests). `server/api.js` keeps its require list (C3 4.1): it calls no controller code that uses `ClimateAir`. `controller.js` reads `global.ClimateAir` at call time (inside functions), so its own load order does not matter; `capacity.js` reads it at load time like its other globals (`const AIR = global.ClimateAir` beside `SIM`), so `air.js` must load before `capacity.js`. The full code is in the plan (`docs/superpowers/plans/2026-10-08-air-exchange/README.md`, task 0.2).

| Export | Signature | Result |
|---|---|---|
| `SIZES` | frozen array | `[600, 900, 1200, 1800, 2400, 3600]` (m³/h): the step list for recommendations |
| `MIN_POINTS` | number | `4`: readings needed for a rise rate |
| `steadyPpm` | `({ co2Out, prodM3h, flowM3h }) → ppm` | `co2Out + prodM3h × 10⁶ / flowM3h`; `Infinity` when `flowM3h ≤ 0` |
| `purgeTimeS` | `({ volume, co2Out, leakM3h = 0, prodM3h, m3h, start, stop }) → s` | With `q = m3h + leakM3h` and `css = steadyPpm(q)`: `0` when `start ≤ stop`; `Infinity` when `q ≤ 0` or `css ≥ stop`; else `volume / q × ln((start − css) / (stop − css)) × 3600` |
| `sizeFor` | `({ volume, co2Out, leakM3h = 0, prodM3h, start, stop, capS, sizes = SIZES }) → { needM3h, size, margin }` | `needM3h`: the smallest airflow with `purgeTimeS ≤ capS`, found by bisection to 1 m³/h and rounded up to a multiple of 50; `Infinity` when none up to 10⁶. `size`: the first of `sizes` ≥ `needM3h`, else `null`. `margin`: the next of `sizes` after `size`, else `null`. |
| `riseRate` | `(points) → ppm/s \| null` | `points`: `[{ t, C }]` (s, ppm). Least-squares slope over the finite points; `null` with fewer than `MIN_POINTS` finite points or when all `t` are equal |
| `prodFromRise` | `({ ratePpmS, volume, leakM3h = 0, co2, co2Out }) → m³/h` | `ratePpmS × 3600 × volume / 10⁶ + leakM3h × max(0, co2 − co2Out) / 10⁶` |

## 4. Simulation (`sim.js`)

### 4.1 Plant and environment

| Item | Rule |
|---|---|
| `PLANT.air` | `{ m3h: 1800, wPerM3h: 0.08 }` (0.08 W per m³/h for the pair, "no source" until equipment research). Replaces `PLANT.fan`. |
| `DEFAULT_ENV.airM3h` | `null` = `PLANT.air.m3h`. A number overrides it (the test bench input, later C8 equipment); the sim uses `m3h = Number.isFinite(e.airM3h) ? clamp(e.airM3h, 50, 10000) : PLANT.air.m3h`. |
| `DEFAULT_ENV.inletAt`, `exhaustAt` | Unchanged (`'high'`, `'low'`) |
| `DEFAULT_ENV.vent` | Removed. An env with `vent` is accepted and the key ignored. |
| Header comment (lines 14–16) | Rewritten: balanced intake + exhaust pair, dampers closed when off |

### 4.2 Command, act, meters, view

| Item | Rule |
|---|---|
| Command | `cmd.air.on` (boolean). `s.act.air = !!(cmd.air && cmd.air.on)`. `cmd.fan` is ignored. |
| `s.act` | `fanLevel` → `air` (boolean) |
| Meters | Key `fan` → `air` in `s.p`, `s.kwh`, `s.runS` and the reading's `power`, `kwh`, `runS` |
| Power | `s.p.air = a.air ? m3h × PLANT.air.wPerM3h : 0`, with `m3h` from 4.1 |
| Run time | `s.runS.air += dt` while `a.air` |
| `view()` | `airM3h`: `(a.air ? m3h : 0) + leak`, where `leak = room.infAch × room.volume` only while the fans are off (with the fans on the leakage is 0, as in today's supply mode). `act.air` replaces `act.fanLevel`. |
| Snapshot restore | `create(env, snapshot)` upgrades an older snapshot: `act.fanLevel` → `act.air = act.fanLevel > 0`; `p.fan`, `kwh.fan`, `runS.fan` → `p.air`, `kwh.air`, `runS.air` (values kept), and the same keys in the stored `s.reading` (`power`, `kwh`, `runS`); the old keys are deleted |

### 4.3 Air flows (replaces sim.js lines 282–303)

| Fans | Flows (m³/s) | Unfiltered (m³/s) |
|---|---|---|
| On | `inflow[inZ] += q`, `outflow[outZ] += q`, `q = m3h / 3600`; no leakage | `0` (the intake is filtered) |
| Off | `inflow.lo`, `inflow.hi`, `outflow.lo`, `outflow.hi` each `+= leak / 2`, `leak = infAch × volume / 3600` | `leak` |
| Door open | Unchanged: `+= qDoor` into and out of the low zone, unfiltered | `+ qDoor` |

`inZ`, `outZ`, `qUp`, `qMix` and the zone flux block are unchanged.

## 5. Controller (`controller.js`)

### 5.1 Command and manual

| Item | Rule |
|---|---|
| `st.cmd` / `st.req` | `fan: { level }` → `air: { on: false }` |
| `cfg.manual` | `fan: { auto, level }` → `air: { auto: true, on: false }` |
| Device key | `'air'` in `st.why`, `st.hold`, `st.out` (`st.out.air.since`) |
| Header comment (lines 11–28) | Rewritten to the purge cycle and the rule list of 5.6 |
| `MACHINES` | `fanLevels`, `fanM3h` removed. `airTags: ['SF-203', 'EF-206']` added. |

### 5.2 Settings

| Key | Type | Range | Default | Meaning |
|---|---|---|---|---|
| `airM3h` (top level, beside `roomM3`) | m³/h | 50–10000 | 1800 | Size of the installed air exchange (the controller's knowledge, used for air volumes and the size message) |
| `rules.fanOn` (kept) | ppm | 450–20000 | `co2Lim − 100` | Purge starts at |
| `rules.fanOff` (kept) | ppm | 400–20000 | `max(450, co2Lim − 300)` | Purge stops at; corrected to ≤ `fanOn − 50` as today |
| `rules.purgeMaxS` | s | 60–900 | 180 | Time cap |
| `rules.minOffS` | s | 30–600 | 60 | Minimum time off after any air run |
| `rules.rhLock`, `rhStop`, `rhResume` | kept | as today | as today | Humidity first (5.6) |
| `rules.freeCool`, `rules.outdoorDry`, `rules.co2Safety`, `rules.co2SafetyAt` | kept | as today | as today | |
| `protect.timedPurgeOn`, `timedPurgeEvery`, `learnSafe` | kept | as today | as today | Timed purge (5.6) |

| Removed key | Removed key | Removed key |
|---|---|---|
| `rules.airMode` | `rules.baseFan` | `rules.fanLevel` |
| `rules.fogBoost` | `rules.rhAction` | `rules.acPurge` |
| `rules.acAction` | `rules.acSetbackC` | `rules.acOff` |
| `rules.acOn` | `rules.maxSetback` | `rules.guard` |
| `protect.fanMinOn` | `protect.fanMinOff` | `manual.fan` |

| Item | Rule |
|---|---|
| `SETTINGS_VERSION` | `2` |
| `RAMP_KEYS` | `['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff']` |
| `profileTargets`, `applyProfile` | Follow `RAMP_KEYS` |
| `SETTING_LIMITS` | Add the ranges above; remove the entries of removed keys |
| `SETTING_ENUMS` | Remove `rules.rhAction`, `rules.acAction` |
| New export `upgradeSettings(obj) → { settings, warnings }` | Pure; does not change `obj`. Works on a settings object (not a file). For each removed key present: delete it and add the warning `Setting "<path>" was removed: fresh air now runs as short purges.` `manual.fan` → `manual.air = { auto: !!fan.auto, on: (fan.level ?? 0) > 0 }`, with the same warning for `manual.fan`; a `manual.fan` that is not an object is dropped with the warning (the default `manual.air` is filled in later). Keys missing from the new shape are not added here (`importSettings` fills defaults). Idempotent: a v2 object gives no warnings. |
| `importSettings(file)` | When `file.version < 2` (or missing), it runs `upgradeSettings(file.settings)` first and puts its warnings before its own. Everything else as today. |
| `noFogBoost` crop flag | Removed (no crop uses it; the test crop `flagTest` drops it) |

### 5.3 States

`st.air = { state, since, purgeStart, capRun, nextPurgeS, delayed, timed, sizeText }`; initial `{ state: 'idle', since: null, purgeStart: null, capRun: 0, nextPurgeS: null, delayed: false, timed: false, sizeText: null }`.

| State | Enter when | Fans (`req.air.on`) | Leave |
|---|---|---|---|
| `idle` | Start, or a purge ended and `minOffS` passed | Off | → `purge` at the start level |
| `purge` | CO₂ ≥ `fanOn`, `minOffS` passed since the last air run, and not delayed (5.6) | On | → `after` when CO₂ ≤ `fanOff` and the purge has run ≥ 30 s, or when it has run `purgeMaxS` (a capped purge) |
| `after` | A purge ended | Off | → `idle` after `minOffS` |

| Rule | Exact behaviour |
|---|---|
| Minimum on | 30 s (`AIR_MIN_ON_S`) for every air run, except a manual change (On or Off) and a CO₂ safety exit, which act at once |
| Minimum off | `rules.minOffS` after every air run; the CO₂ safety level and a manual change ignore it |
| Capped purge counter | `capRun += 1` after a capped purge; `capRun = 0` after a purge that reached `fanOff` |
| Purge seconds | A purge's time counts from the step it starts to the step it ends (whole controller steps) |
| Manual control, CO₂ fault | `st.air.state` goes to `idle` (offsets 0). A purge running at that moment ends without counting as capped. |
| Safety runs | A CO₂ safety run is not a purge: it never counts in `capRun`, `purges`, `cappedPurges` or `longestPurgeS`, however long it lasts |
| Current reason | `ctl.state.airReason`: the reason of the running air run (`'purge' \| 'safety' \| 'timed' \| 'free cooling' \| 'drying' \| 'manual'`), `null` when off; it follows the run as it changes (`purges().cur.reason` keeps the reason at the start) |

### 5.4 Rise rate and next purge

There is no Prepare step (owner decision, 2026-10-09). A 24 h prototype showed that moving the AC and fogger targets before a purge lowered the time in band in every case (2000 blocks at 1800 m³/h: in band 100 % / 100 % without it, 99.2 % / 93.8 % with it), while short, capped purges alone kept the room in band. The AC and fogger keep their normal targets through a purge and recover after it; there is no AC setback.

| Item | Rule |
|---|---|
| Points | The good CO₂ readings (`t`, `CO2`) since the last air run ended; at most the last 20 |
| Rise rate | `ClimateAir.riseRate(points)` |
| `nextPurgeS` | `(fanOn − CO2) / rate` when `rate > 0` and CO₂ < `fanOn`; `0` at or above `fanOn`; `null` otherwise. Shown to the farmer ("next purge in about … min"); used for nothing else |
| Push of humidity | `pushAH = ahOf(tOut, rhOut) − ahOf(T, RH)` (g/m³); used by humidity first (5.6). `null` with an outdoor, T or RH sensor fault |

### 5.5 Size message

| Item | Rule |
|---|---|
| Alarm | New `ALARMS` entry `{ id: 'airTooSmall', label: 'Air exchange too small for the CO₂ load', lvl: () => 'warning' }`; on when `st.air.capRun ≥ 3`; off when `capRun` returns to 0 |
| Estimate | With the last rise rate: `prod = ClimateAir.prodFromRise({ ratePpmS, volume: cfg.roomM3, co2: CO2, co2Out: 420 })`; `need = ClimateAir.sizeFor({ volume: cfg.roomM3, co2Out: 420, prodM3h: prod, start: fanOn, stop: fanOff, capS: purgeMaxS })` |
| Rise rate kept | The estimate uses the last positive rise rate; with none (no rate yet, or CO₂ falling), the "not measured yet" text |
| Text | `st.air.sizeText`: `Purges don't reach <fanOff> ppm in <cap> min. The air exchange needs about <needM3h> m³/h (now <airM3h> m³/h).`; `null` when the alarm is off. `<needM3h>` is a plain integer (no thousands separator); `<cap>` is minutes with at most one decimal. With no rise rate yet: `Purges don't reach <fanOff> ppm in <cap> min. The air exchange is too small; the size needed is not measured yet.` With `needM3h = Infinity`: `Purges don't reach <fanOff> ppm in <cap> min: outside air alone cannot bring CO₂ this low; raise the stop level.` Shown in `st.why.air` and in the event that raises the alarm. |

### 5.6 Rules around the purge, in priority order

| Priority | Rule | Effect on `req.air.on` |
|---|---|---|
| Manual | `manual.air.auto === false` | `manual.air.on` |
| 1 | CO₂ safety (`rules.co2Safety`, CO₂ ≥ `co2SafetyAt`, sensor good) | On until CO₂ < `co2SafetyAt − 20`; ignores the cap and the minimum off time |
| 2 | Humidity first (`rules.rhLock`, RH ≤ `rhT − rhStop`, the fogger at its maximum for `FOG_FULL_S`, and `pushAH ≤ −0.5`) | A purge does not start (`st.air.delayed = true`) until RH ≥ `rhT − rhResume` or CO₂ ≥ `co2Lim`. A purge already running is not stopped. `delayed` is true only while `fanOn ≤ CO₂ < co2Lim` and the condition holds; "Purge allowed again" is said only when RH recovers (not when CO₂ reaches `co2Lim`). |
| 3 | CO₂ purge (5.3) | On in `purge` |
| 3 | CO₂ sensor fault: timed purge | `share = learned` (the past run seconds per hour ÷ 3600 × 1.1, from `historyFor('runS', …)` as today) or `timedPurgeOn / timedPurgeEvery`; clamped 0.02–0.9. Run length `min(purgeMaxS, share × timedPurgeEvery × 60)`; period `max(run / share, run + minOffS)`; on while `t mod period < run`. `st.air.timed = true`. |
| 4 | Free cooling (`rules.freeCool`) | As today's `lCool` condition (room warm, outdoor ≥ 3 °C cooler): on; not a purge, not capped |
| 4 | Outdoor drying (`rules.outdoorDry`) | As today's `fanDryOn` hysteresis: on; not a purge, not capped |
| Sensor check | CO₂ spike filter (the rate test of `validate`) | A falling CO₂ while `cmd.air.on`, and for one reading after the fans stop, is not tested against the rate limit: a strong purge really lowers CO₂ faster than 1000 ppm/min. A rising CO₂ is tested as today. |

### 5.7 Records, statistics, status, events

| Item | Rule |
|---|---|
| `ctl.purges()` | Replaces `ctl.exhaust()`. `{ cur, events, hours }`. `cur`: the running air run in the event shape with `end: null`, `co2End: null`, `capped: false`; `null` when the fans are off. Event: `{ start, end, reason, co2Start, co2End, m3, capped }`, `m3 = runS × cfg.airM3h / 3600`, at most 200 events. Hour bucket: `{ h, runS, starts, m3, cappedN, fogLS, acHighS, acLowS }`, 168 h kept. `reason` ∈ `'purge' \| 'safety' \| 'timed' \| 'free cooling' \| 'drying' \| 'manual'`. |
| `st.stats` | `{ airOnS, purges, purgeS, longestPurgeS, cappedPurges, delayedS, fogStarts, acCmds }` (replaces `fanOnS`, `fanStarts`, `setbackS`, `acOffS`, `fanBlockedS`). `purges`, `purgeS`, `longestPurgeS`, `cappedPurges` count CO₂ purges only (state `purge`); `airOnS` counts every air run. |
| `status('CO2')` | Order: sensor fault; `co2Safe` → as today; `co2Hi` → as today; `airReason === 'safety'` → `{ lvl: 'serious', icon: '◆', text: 'Safety run' }` (covers the first 60 s before the `co2Safe` alarm); `delayed` → `{ lvl: 'info', icon: '❚❚', text: 'Purge delayed (RH)' }`; `purge` → `{ 'info', '▲', 'Purging' }`; else `{ 'good', '✓', 'Below limit' }` |
| `st.why.air` | `idle`: `CO₂ is <x> ppm. The next purge starts at <fanOn> ppm` plus ` (in about <m> min)` when `nextPurgeS` is known. `purge`: `Purging since <m:ss> (at most <cap>). It stops at <fanOff> ppm.` `after`: `Minimum off time: <s> s.` plus 5.5 when on |
| Events (`say`) | `Air exchange on: <reason>` / `Air exchange off (<m:ss>, CO₂ <x> ppm)` / `Purge stopped at the time cap (<m:ss>)` / `Purge delayed: humidity first` / `Purge allowed again: humidity recovered` / `CO₂ sensor fault: timed purge started` / `… ended` / the 5.5 alarm |
| Removed | `acPurge()`, setback state, `purgeHeld`, `purgeReduced`, `airLevel`, `AIR_STEP_S`, fog boost |
| Snapshot restore | `create(cfg, snapshot)` upgrades an older snapshot: drops the removed state fields, sets `cmd.air` / `req.air = { on: cmd.fan.level > 0 }`, sets `st.air` to its initial value, renames `out.fan` → `out.air`, `hold.fan` → `hold.air`, `why.fan` → `why.air`, `exh` → the purge record (events dropped, hours kept with `cappedN: 0`), and maps the old stats (`fanOnS` → `airOnS`, `fanStarts` → `purges`); `exh.cur` is dropped, `prev` set to `null`, every new field at its initial value |

## 6. Data

### 6.1 Reading and database

| Item | Rule |
|---|---|
| Reading key | `fan` → `air`: integer `0` / `1` in a raw row (`cmd.air.on ? 1 : 0`); the fraction of readings with the air exchange on in a bucket row |
| `UPGRADES` | Append `{ version: 2, sql: SCHEMA_V2_AIR }`. Released upgrade 1 is not edited. |
| `SCHEMA_V2_AIR` | Exactly the SQL of 6.2 |
| Statements | `READING_KEYS`, the insert statement, `RAW_READINGS_COLS`, the bucket query (`AVG(air) AS air`) and the binding use `air` |
| Room object | `{ id, name, volume, adapter, created_at, archived_at }` (no `vent`) |
| Fake db | Same key rename, `air` CHECK `IN (0, 1)`, no `vent`, `version: 2` |

### 6.2 `SCHEMA_V2_AIR`

```sql
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
```

Checked on Node 22.20 (SQLite 3.50.4) inside `BEGIN IMMEDIATE` with `foreign_keys = ON`: no table references `readings`, and `DROP COLUMN` works on a column with only its own CHECK. `ac_mode` keeps the value `'fan'` (the AC's fan-only mode).

### 6.3 Room manager, rules and API

| Item | Rule |
|---|---|
| `buildReadingRow` | `air: cmd.air && cmd.air.on ? 1 : 0` in place of `fan` |
| Stored settings | Every settings object read from the database goes through `ClimateController.upgradeSettings` before `importSettings` (rooms.js lines ~300, ~492, ~627); its warnings join the import warnings |
| Controller and sim snapshots | Passed to `create` unchanged; the upgrades of 4.2 and 5.7 handle old ones |
| Simulated size | `sim-adapter.js` sets `env.airM3h = settings.airM3h` when it builds the env, so a simulated room runs with its own size. A saved change of `airM3h` reaches the simulation no later than the next loop restart. |
| Fake manager | `tests/fakes/rooms.js` runs `upgradeSettings` before its import too (C2 16), like the real manager |
| `TARGET_KEYS` | Follows `RAMP_KEYS` (5.2) |
| Pair correction | `rules.fanOn` / `rules.fanOff` only (the `acOff` / `acOn` pair is removed) |
| `vent` | Removed from `validateVent`, `create`, `update`, `DEMO_ROOM`, the fake rooms, `RULES.normRoom` and `RULES.checkRoom` (now an unknown field: the existing unknown-field error from `checkRoom`, `rooms.update` and the database; `rooms.create` ignores unknown keys as C2 4 says), `server/api.js` (`vent` no longer read) and `sim-adapter.js` (`env.vent` no longer set) |
| `ALARM_KEYS` (`room-rules.js`) | Add `'airTooSmall'` |
| Requires | `server/rooms.js` and `server/sim-adapter.js` require `../air.js` before `../controller.js` / `../sim.js` |

## 7. Web

| Place | Rule |
|---|---|
| `index.html` (lead, step 0) | `<script src="air.js"></script>` before `controller.js` |
| Room drawing (`web/simulator.js`) | `mimicLayout({ inletAt, exhaustAt })` → `{ inlet: { band, kind: 'fan', tag: 'SF-203', label: 'Filtered intake' }, outlet: { band, kind: 'fan', tag: 'EF-206', label: 'Exhaust' } }`. Two fan groups (`#fanIn`, `#fanOut`), both spin while `act.air`; the grille is removed. With the fans off, each shows a closed damper (a bar across the opening). Text: `Purge <m3h> m³/h` / `Off · dampers closed`. |
| Status card | `faceplate('air', 'Air exchange', 'SF-203 + EF-206 · <m3h> m³/h', …)`; ids `airState`, `airPower`, `airWhy`; state `Idle` / `Idle · purge in about <m> min` / `Purge <m:ss> of <cap>` / `Delayed (humidity first)` / `Safety run` / `Timed purge` / `Free cooling` / `Drying` / `Manual on` / `Manual off` |
| Glance panel | Adds a row `Air exchange`: `Next purge in about <m> min` / `Purging <m:ss>` / `Delayed (humidity first)` / for other air runs the status card's text / `Manual off` / `Idle`; per day: `Purges <n> · average <m:ss>` |
| Settings panel (`web/settings-panel.js`) | Rules card heading `Air exchange and CO₂`. Priority 2 text: "Delay purges that dry the room when humidity is low". Priority 3 fieldset `CO₂ purge`: `rFanOn`, `rFanOff`, `rPurgeMax` (min, 1–15, stored as s), `rMinOff` (s, 30–600). Removed: `rRhAction`, `rAirMode`, `rFanLevel`, the whole AC-during-purge fieldset. The Machines card device `air` ("Air exchange") with an On/Off checkbox `airOnChk` in place of `fanLevelSel`. Installer group "program and room": number input `inAirSize` "Air exchange size" (m³/h, 50–10000) next to Room volume, writing `airM3h`. `FIELDS` updated to match (the count follows), with labels and units in 7.1. |
| Charts (`web/charts.js`) | Power key `fan` → `air` (legend "Air exchange"); `LADDER_ROWS` = one row `{ key: 'air', name: 'Purge', hi: fanOn, lo: fanOff }`; `drawExhaustBars` becomes `drawPurgeBars(el, hours, clock)` (the clock labels the hours; the current hour is the last bucket's) ("Air exchange run minutes per hour", title `<n> purges, <m3> m³, <capped> capped`; no volume argument); `createLadder` chips `{ air }`. The ladder has one row; its chip shows the state (Idle, Purging, Delayed, Safety run). |
| Test bench | `#inVent` removed. New number input `#inAirM3h` "Air exchange size (m³/h)", 50–10000, sets `env.airM3h` and `cfg.airM3h` together. The plant facts line reads `Air exchange: <m3h> m³/h, <W> W while on`. |
| Capacity page (`web/capacity.js`) | `vent` removed from rooms; `LIMIT_WORD.air = 'the air exchange (CO₂ purges)'`; `FAIL_MACHINE['CO₂ above the limit'] = 'the air exchange is too small for short purges'` |
| Calibration page | CSV help: column `air` (0 or 1; an old `fan` column 0–3 is read as on when > 0). The supply-fan tag text is removed. |
| Room page (C5 7.9, 7.10) | Command from a Reading: `air: { on: r.air === 1 }` in place of `fan.level ← r.fan`; the restart-check fixture room has no `vent` |

### 7.1 Settings labels (`FIELDS`)

| Path | Label | Unit |
|---|---|---|
| `rules.fanOn` | Purge starts at | ppm |
| `rules.fanOff` | Purge stops at | ppm |
| `rules.purgeMaxS` | Longest purge | s |
| `rules.minOffS` | Minimum off time | s |
| `airM3h` | Air exchange size | m³/h |
| `manual.air.auto` | Air exchange | – |
| `manual.air.on` | Air exchange: manual output | – |

## 8. Capacity, cycle, calibration, tools

| File | Rule |
|---|---|
| `capacity.js` `balance` | No base fan. `dC = (rules.fanOn + rules.fanOff) / 2 − co2Out`; average outdoor air `air(n) = max(R.infAch × R.volume, n × c / dC)` (m³/h): with few blocks the wall leakage, not the purges, is the outdoor air the AC and fogger must treat. `out.air` replaces `out.fan`: the largest whole `n` with `ClimateAir.purgeTimeS({ volume: R.volume, co2Out: R.co2Out, leakM3h: 0, prodM3h: n × c / 10⁶, m3h: airM3h, start: rules.fanOn, stop: rules.fanOff }) ≤ rules.purgeMaxS` (`c` = `mixCo2(room, mix)` in mL/h per block, so `n × c / 10⁶` is m³/h of CO₂), found by bisection over 0–100000 (`Infinity` when 100000 blocks still pass, like the other limits), where `airM3h = airOf(room)`. `limit ∈ 'air' \| 'ac' \| 'fog'`. New export `airOf(room)` = `Number.isFinite(room.airM3h) ? clamp(room.airM3h, 50, 10000) : PLANT.air.m3h` (the sim's own rule, 4.1), used everywhere a room's size is needed so the balance, the sim and the controller get the same number. |
| `capacity.js` rooms | `room = { name, volume, airM3h?, calib }` (no `vent`). No room stores a size yet (that is C8): `RULES.normRoom` keeps its key set and drops `airM3h`; only in-browser callers (the test bench) pass `airM3h`. |
| `capacity.js` trial | `env.airM3h = cfg.airM3h = airOf(room)` (the controller knows the size it runs); `vent` no longer set |
| `cycle.js` | `vent` no longer set; `env.airM3h = cfg.airM3h = CAP.airOf(room)` as the capacity trial; `cfg.manual.air.auto = true` replaces the fan line; energy keys follow 4.2 |
| `calib.js` | CSV column `air` (aliases `air`, `fan`, `fan_level`, `exhaust`; a value > 0 means on). Replay command `air: { on: (r.air ?? 0) > 0 }`. `toCsv` writes `air`. |
| `tools/run-headless.js` | Unchanged output; follows the meter keys |
| `tests/harness.js` (lead, step 2) | Requires `../air.js`; returns `airKwh`, `airH`, `purges`, `cappedPurges`, `longestPurgeS`, `alarmIds`, `sizeText` in place of `fanKwh`, `fanH`, `fanStarts` |

## 9. Vectors

| Item | Rule |
|---|---|
| `pack(cmd)` (both copies) | `[ac.power ? 1 : 0, ac.mode, ac.setpoint, ac.fan, hu.level, air.on ? 1 : 0, lights.on ? 1 : 0, circ.on ? 1 : 0]` |
| `cmdFields` | `['acPower', 'acMode', 'acSetpoint', 'acFan', 'fogLevel', 'air', 'lights', 'circ']` |
| Scenario `crowded-dry` | `cfg.rules = defaultRules(1000)` (no `rhAction`, no `fanLevel`) |
| New scenario `capped-purges` | 6 h, 6000 blocks, `env.airM3h: 900`, `cfg: { airM3h: 900 }`, other settings default: the purges hit the cap |
| Regeneration | By the lead at step 2, after the simulation and controller streams merge |

## 10. Overridden sections of older contracts

| Contract | Sections | Now |
|---|---|---|
| `docs/contract.md` | 2 (row `fan.level`, adapter rule "exhaust fan at Low"), 3 (`cmdFields`, example, `crowded-dry` text), 4 (version 1, the fan-pair example) | `air.on`; "air exchange on"; section 9; version 2 |
| C1 `db.md` | 3 (upgrade list), 4 (`readings.fan`, `rooms.vent`), 4.2, 6.2, 6.4, 6.6, 9 | 6.1, 6.2 |
| C2 `rooms.md` | 1, 2, 3, 4, 5.1, 5.3 (`fan` row), 6.1, 9.1, 9.2 step 7, 13.1, 15, 17 (Recording, Whole machine levels, Pair correction) | 6.3. The "Whole machine levels" test uses `manual.air` instead of `baseFan: 5`. |
| C3/C4 `api.md` | 3.1 (`vent`), 3.2 (`fan`), 5, 6.2, 6.3, 6.8, 7.1, 7.2, 8, 8.1, 10.2, 11 | 6.1, 6.3 |
| C5/C6 `web.md` | 3.2, 3.3, 3.4, 3.6, 3.7, 4.3, 6.1, 6.2, 7.2, 7.3, 7.4, 7.7, 7.8, 7.9, 7.10 | Section 7 |
| C7 `cycle.md` | "`sim.js`, `controller.js`, `runtime.js` not changed" (lines 17, 34, 380), 54, 96, 168, 258, the example numbers (337–346) | Section 8; the example numbers are re-measured by the lead at step 2 |
| C8 `equipment.md` (parked on branch `wave2/contracts-folded`, commit 75a2ad5, not frozen) | `fan_m3h` (Equipment fields, `DEFAULTS`, `LIMITS`, `calibrations.equipment` JSON), `FAN_SIZES`, `FAN_MIN_ACH`, the `fan.levels` scaling row (206), the fan verdict rows (423, 490, 495: "lowest speed", oversized) | `air_m3h` (50–10000, default 1800) everywhere `fan_m3h` stands; `ClimateAir.SIZES` for `FAN_SIZES`; the fan verdict is `too-small` when `ClimateAir.sizeFor(...).needM3h > air_m3h` (with `recommended = size`), else fine; no oversized rule (the pair is off between purges, so a bigger pair only shortens purges); the `fan.levels` row is dropped |
| Wave 2 contracts (parked on `wave2/contracts-folded`: `db.md`, `api.md`, `rooms.md`, `web.md`, `cycle.md`, `LEAD-DECISIONS.md` 14–54) | Lead decision 54 ("upgrade 2 holds everything"), the reading key `fan`, `rooms.vent`, decision 51 (`mimicLayout({ vent, … })`) | Wave 2's upgrade becomes **3** (C9 owns 2); reading key `air`; no `vent`; `mimicLayout({ inletAt, exhaustAt })` (section 7). The parked branch is rebased on `master` after C9 merges and fixes these in its own contracts. |

## 11. Tests and gate

| Test | Owner | Proves |
|---|---|---|
| `tests/air.test.js` | Lead | Each `ClimateAir` function on hand-computed values; `sizeFor` gives the smallest multiple of 50 that meets the cap (`purgeTimeS(need) ≤ cap < purgeTimeS(need − 50)`); `Infinity` and `null` cases |
| `tests/controller.test.js` | Controller | The transitions of 5.3; 30 s minimum on; `minOffS`; `nextPurgeS` from the rise rate; humidity first delays but never past `co2Lim`; safety ignores the cap; timed purge share, run and period; the size alarm after 3 capped purges, its text and its clearing; `status('CO2')`; old snapshot upgrade |
| `tests/settings.test.js` | Controller | A version 1 file: one warning per removed key present, `manual.fan` → `manual.air`, `fanOn` / `fanOff` kept; a version 2 file round-trips with no warnings; new ranges clamp |
| Simulation tests (`tests/capacity.test.js`, `tests/cycle.test.js`, `tests/calib.test.js`, plus new cases in `tests/capacity.test.js` for the air flows) | Simulation | 4.3 flows, power and meters; snapshot upgrade; `balance` `out.air` matches a hand calculation with `ClimateAir`; calibration CSV round trip with `air` and an old `fan` column |
| `tests/db.test.js`, `tests/fake-db.test.js` | Data | Upgrade 2 on a version 1 file with rows `fan` 0–3 gives `air` 0/1, no `vent` column, `db.version === 2`; bucket `air` is the fraction on; `air: 2` is rejected (275) |
| `tests/rooms.test.js`, `tests/api.test.js`, `tests/stream.test.js`, `tests/room-rules.test.js`, `tests/fake-rooms.test.js` | Data | Reading key `air`; `vent` rejected as an unknown field; stored version 1 settings load with warnings |
| `tests/web-*.test.js`, `tests/settings-diff.test.js` | Web | `mimicLayout`; `FIELDS` matches 7.1; ladder row; power key |
| `tests/integration.test.js` | Lead | Spec section 5 integration rows: 6000 blocks at 1800 m³/h, every purge ≤ 180 s and CO₂ ≤ `co2Lim`; at 900 m³/h the size alarm with an estimate within 15 % of `ClimateAir.sizeFor` on the sim's true output; 2000 blocks at 1800 m³/h: short purges keep T and RH in band (at least 98 % and 97 % of the time) |
| Gate | Lead | `npm test` green after each merge (order: simulation, controller, data, web); vectors regenerated; headless Chrome: both fans spin in a purge, the status card shows Idle with the next purge, and Purge, the settings panel saves the new keys on a live room |

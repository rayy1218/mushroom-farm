# Work brief: Wave 2, Rooms UI (`web/rooms.js`)

Date: 2026-10-08. Stream: **Rooms UI**. Wave: 2. You are the implementer; reviewers check spec compliance and code quality before the lead merges.

## 1. Goal

Replace the lead's wave 0 stub `web/rooms.js` with the **Rooms** module of the farm app.

| Part | Route | What the farmer gets |
|---|---|---|
| Rooms list | `#/rooms` | One card per room: name, crop and stage, T / RH / CO₂ now with status chips, machines, active alarm count, and "Stopped" with the error and a **Restart** button when the loop is down. A **New room** form (name, volume m³, vent). Cards update live. |
| Room page | `#/rooms/:id` | Header with running/stopped state and **Restart**; live readings and machines; history charts (1 h, 6 h, 24 h, 7 days); alarms with **Acknowledge**; event log with **Older**; room details (rename, volume, vent, **Archive**); the settings editor with **Save** (change list) and **Discard**; settings versions with **Restore**. |

The browser is only the screen: it runs no controller for a live room. All data comes from the HTTP API (C3) and the live feed (C4) through `FarmApi` (C5 section 4).

## 2. Before you start

You work alone in your own git worktree, branched from `master` after the wave 1 merge and the lead's wave 1.5 gate (C3 section 2.3).

| Check | Expected; otherwise stop and report to the lead (never write a stand-in) |
|---|---|
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` | All three listed (C5 section 1.6); `web/rooms.js` is the stub of C5 section 1.5 |
| `ls docs/contracts/db.md docs/contracts/rooms.md docs/contracts/api.md docs/contracts/web.md` | All four listed |
| `ls web/shell.js web/ui.js web/api.js web/charts.js web/settings-panel.js server/main.js` | All listed (wave 1 code) |
| `npm test` | Green. Write down the number of passing tests (the baseline). |

Git: keep the configured identity (never change `git config`). Commit after each task (`feat(rooms-ui): …`, `test(rooms-ui): …`, `style(rooms-ui): …`). Do not push, merge or rebase.

## 3. Files

| File | Action | Rule |
|---|---|---|
| `web/rooms.js` | Replace the stub | The module (section 5) |
| `tests/web-rooms.test.js` | Create | Node tests of the pure functions (section 6) |
| `styles.css` | Append only | One block at the very end, starting with `/* Rooms */` (C5 section 1.1). Never change or reorder an existing rule. |

These are the only files you may create or change. Everything else is read-only, in particular `index.html`, `web/*.js` other than `web/rooms.js`, `room-rules.js`, `server/*`, `tests/fakes/*`, `docs/*`, `package.json`, `controller.js`, `sim.js`, `runtime.js`, `capacity.js`, `calib.js`, `tests/vectors/*` and every existing test. Headless check scripts live in `/tmp` and are never committed. If a contract or another stream's file is wrong or lacks something you need, stop that part and report it (section 11); do not work around it.

## 4. Contracts you build against

| Contract | Sections | What you take from it |
|---|---|---|
| Lead decisions (`LEAD-DECISIONS.md`) | 1, 2, 4, 5, 6 | Reading keys `T`, `RH`, `CO2`, `t_out`, …; `room` events are C2's only; the 45 s stream watchdog is `FarmApi`'s; `restartRoom`; the page never calls `applySettings` |
| C5 `docs/contracts/web.md` | 1.3, 1.4, 1.5, 1.6 | Load order, wrapper, no DOM work at load, markup set once per mount with `innerHTML`, dynamic text only with `textContent`, no globals; the stub you replace |
| C5 | 2.1, 2.3, 3.1 | Routes `#/rooms` (`params = {}`) and `#/rooms/:id` (`params = { id: Number }`); unmount and mount between them; `mount` / `unmount` rules |
| C5 | 3.2 (row `rooms`), 3.4 | What the list and page show; the **required** `listRooms()` refresh after `reading` events (row "Status chips and targets"); chart windows and steps; Reading → ChartPoint; `gapS`; reconnect reloads |
| C5 | 4.1–4.4 | `FarmApi` functions, `ApiError`, `stream(onEvent)` with `open` / `down` |
| C5 | 4.5 | `startFakeApi({ root })` for the Restart check (section 8.2) |
| C5 | 5 | `FarmUi.set`, `paintChip`, `fmtNum`, `watts`, `ICON`, `farmClock`, `errorText` |
| C5 | 6.1–6.3 | `ChartPoint`, `View`, `Chip`, `createTrendCharts`, `createLadder` |
| C6 `docs/contracts/web.md` | 7.2–7.6, 7.9 | The panel and its methods, slots, `diffSettings`, `applyChanges`, `showChanges`, change line `<label>: <oldText> → <newText>`; 7.9 is **normative** for the room page settings |
| C6 | 7.10 (rows "how wave 2 checks run", "Rooms UI", "Rooms UI Restart") | The headless checks you must pass |
| C3 `docs/contracts/api.md` | 3.1–3.5, 4 | Room, Live, Reading, Event, Alarm, Settings, SettingsVersion JSON; error body `{ error, details }` |
| C3 | 6.1–6.11, 6.19 | The routes behind each `FarmApi` call and their effects |
| C4 `docs/contracts/api.md` | 10.2–10.4 | Stream `data`; open first, then load; merge rules; reconnect reload |
| C2 `docs/contracts/rooms.md` | 7, 8.5 | When `room` is sent (summary `stage`, `crop`, `alarms`, `running`, `error` only); the event texts the headless check expects |
| C1 `docs/contracts/db.md` | 4.2 (`readings`) | Values are stored raw; charts hide implausible values |

## 5. Design (fixed for this stream)

The contracts leave the markup, ids and texts open; this section fixes them. Follow it exactly.

### 5.1 Module shape

| Item | Rule |
|---|---|
| Wrapper | `(function (global) { 'use strict'; … })(typeof window !== 'undefined' ? window : globalThis);` |
| Registration | At load, exactly one call: `global.FarmShell.register('rooms', { mount, unmount, logic })`. No global is defined. |
| `logic` | Plain object with the pure functions of 5.2, for the Node tests. The shell ignores it (stream decision, reported in section 11). |
| At load | No DOM access, no `FarmApi` call, no timer. `ClimateController`, `ClimateSim`, `FarmUi`, `FarmApi`, `FarmCharts`, `FarmSettingsPanel` are read inside functions. |
| `mount(el, params)` | No `params.id`: the list (5.4). With `params.id`: the room page (5.5). Both follow 5.3. |
| Clock | `clock = FarmUi.farmClock()` for every time shown and for the charts. "Now" = `Math.floor(Date.now() / 1000)`. |

### 5.2 Pure functions (`logic`)

None changes its arguments or touches the DOM or network. `CC` = `ClimateController`. `TG` = `{ spT, spRH, co2Lim, fanOn, fanOff }`.

| Function | Signature → result | Rule |
|---|---|---|
| `windowQuery` | `(windowS, now) → { from, to, step }` | `from = now − windowS`, `to = now`; `step`: 3600 and 21600 → `undefined`, 86400 → 120, 604800 → 900 (C5 3.4). Other `windowS`: throws `RangeError('Unknown chart window <windowS>')`. |
| `gapFor` | `(step) → int` | `3 × max(30, step \|\| 0)` |
| `reconnectQuery` | `(windowS, lastT, now) → { from, to, step, merge } \| null` | `windowS === 3600` and `lastT` finite: `{ from: max(lastT + 1, now − 3600), to: now, step: undefined, merge: true }`, or `null` when `from > to`. Otherwise `{ ...windowQuery(windowS, now), merge: false }` (C4 10.4). |
| `chartTargets` | `(live, base) → TG` | `spT`, `spRH`, `co2Lim` = `live.targets.T`, `.RH`, `.CO2` when `live` and `live.targets` are not `null`, else `base.spT`, `base.spRH`, `base.co2Lim`. `fanOn`, `fanOff` = `base.rules.fanOn`, `.fanOff`. No source (for example `base` `null`): `NaN`. |
| `toChartPoint` | `(r, tg) → ChartPoint` | Exactly the keys `t, T, RH, C, tOut, rhOut, spT, spRH, co2Lim, fanOn, fanOff`. `T` ← `r.T`, `RH` ← `r.RH`, `C` ← `r.CO2`, `tOut` ← `r.t_out`, `rhOut` ← `r.rh_out`, each `NaN` when `null`, not finite, or outside `CC.SENSORS[k]` `min`–`max` (`k` = `T`, `RH`, `CO2`, `tOut`, `rhOut`; today's `plausible` in `app.js`). Targets from `tg`. |
| `retarget` | `(pts, tg) → ChartPoint[]` | New array; every point gets the targets of `tg` |
| `mergePoints` | `(pts, p, from) → ChartPoint[]` | New array, `t` ascending; points with `t < from` dropped; a point with `p.t` is replaced by `p`; `p` with `p.t < from` is not added |
| `upsertRoom` | `(rooms, room) → Room[]` | New array, `id` ascending. `room.archived_at !== null`: that id removed. Else same id replaced, new id inserted in order. |
| `takeLive` | `(rooms, reply) → Room[]` | The `listRooms()` refresh (C5 3.4). New array, same rooms and order. A room whose id is in `reply` (and whose `live` and the reply's `live` are not `null`) becomes a copy with `live = { ...room.live, status: r.live.status, targets: r.live.targets }`; every other room is kept as is. Rooms only in `reply` are not added. |
| `refreshDelay` | `(lastMs, nowMs) → int` | Wait before the next refresh call: `0` when `lastMs` is `null`, else `max(0, lastMs + 30000 − nowMs)` |
| `mergeEvent` | `(events, ev) → Event[]` | New array, `id` descending; an `id` already present: unchanged |
| `readingTexts` | `(r, clock) → { T, RH, CO2, at }` | `` `${fmtNum(r.T, 1)} °C` ``, `` `${fmtNum(r.RH, 0)} % RH` ``, `` `${fmtNum(r.CO2, 0)} ppm` ``, `` `Reading at ${clock.stamp(r.t)}` ``. `r === null`: `—`, `—`, `—`, `No reading yet`. |
| `machineLines` | `(r, vent) → string[]` | `r === null`: `[]`. 1: `AC off` when `ac_mode === 'off'`, else `` `AC ${AC_WORD[ac_mode]} ${fmtNum(ac_setpoint, 1)} °C` `` with the module's `AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' }`. 2: `` `Fogger level ${fog}` ``, or `Fogger off` when `fog === 0`. 3: `Supply fan` (vent `supply`) or `Exhaust fan`, a space, then `CC.MACHINES.fanLevels[fan]`, or `off` when `fan === 0`. 4: `Lights on` / `Lights off` (`lights === 1`). 5: `Circulation fan on` / `Circulation fan off` (`circ === 1`). 6, only when `power_w` is finite: `` `Power ${FarmUi.watts(power_w)}` ``. |
| `cropStageText` | `(live) → string` | `live` or `live.crop` `null`: `—`. Else `CC.CROPS[crop].name` (the key when unknown) + ` · ` + `CC.STAGES[stage]` (the key when unknown). |
| `stateChip` | `(live) → Chip \| null` | `null` → `null`. Running: `{ lvl: 'good', icon: '✓', text: 'Running' }`. Else `{ lvl: 'serious', icon: '!', text: error ? 'Stopped: <error>' : 'Stopped' }`. |
| `alarmChip` | `(n) → Chip` | `0`: `{ lvl: 'good', icon: '✓', text: 'No active alarms' }`; else `{ lvl: 'warning', icon: '▲', text: '<n> active alarm(s)' }` |
| `alarmTexts` | `(a, clock) → { main, state, canAck }` | `main` = `` `${a.label} · since ${clock.stamp(a.raised_at)}` ``; `state` = (`Active` when `cleared_at === null`, else `` `Cleared ${clock.stamp(a.cleared_at)}` ``) + ` · ` + (`not acknowledged` when `acked_at === null`, else `acknowledged`); `canAck` = `acked_at === null` |
| `commandFromReading` | `(r) → Command \| null` | C6 7.9: `{ ac, hu: { level: r.fog }, fan: { level: r.fan }, lights: { on: r.lights === 1 }, circ: { on: r.circ === 1 } }`; `ac` = `{ power: true, mode: r.ac_mode, setpoint: r.ac_setpoint }` when `r.ac_mode !== 'off'`, else `{ power: false }` (no other key). `null` → `null`. |
| `detailChanges` | `(room, form) → object` | `form` = `{ name, volume, vent }` (strings). Only what differs: `name` (sent trimmed) when `form.name.trim() !== room.name`; `volume` (as `Number`) when `Number(form.volume) !== room.volume`; `vent` when `form.vent !== room.vent`. `{}` when nothing differs. |
| `newRoomName` | `(name, count) → string` | `name.trim()`, or `` `Room ${count + 1}` `` when empty (same rule as Capacity, C5 3.7) |
| `countText` | `(n) → string` | `0`: `''`; else `` `${n} unsaved change(s)` `` |
| `changeLines` | `(changes) → string[]` | `` `${c.label}: ${c.oldText} → ${c.newText}` `` (C6 7.5) |
| `versionText` | `(v, clock, current) → string` | `` `${clock.stamp(v.saved_at)} · ${v.note ?? '—'}` ``, plus ` · current` when `current` |
| `rebase` | `(from, edited, to) → { settings, kept }` | `pending = FarmSettingsPanel.diffSettings(from, edited)`; `{ settings: FarmSettingsPanel.applyChanges(to, pending), kept: pending.length }`. This is every C6 7.9 "keep the edits" step: Save reply `rebase(sent, panel.get(), reply.settings)`; stream `settings` `rebase(base, panel.get(), data.settings)`; reconnect `rebase(base, panel.get(), fresh)`. |

### 5.3 Shared mechanics (list and page)

| Item | Rule |
|---|---|
| Stream | Mount sets the markup, then `close = FarmApi.stream(onEvent)`. Nothing loads before an `open` (C4 10.3). |
| Load on `open` | Each `open` (first or `reconnect: true`) empties the feed line, sets `loading = true` and runs the load of 5.4 / 5.5. Any `reading`, `event`, `alarm`, `settings` or `room` event that arrives while `loading` is pushed to `early`. When every part has settled (`Promise.allSettled`), `loading = false` and the `early` events are handled in arrival order. So nothing between open and load is lost (C4 10.3). |
| `down` | Feed line = `Live feed lost: <data.error>. Reconnecting…` |
| Status refresh (C5 3.4, required) | On a `reading` of a shown room (list: any listed room; page: its room): when `refresh.timer` is set or `refresh.queued` is `true`, nothing; when `refresh.busy`, `refresh.queued = true`; else `refresh.timer = setTimeout(runRefresh, refreshDelay(refresh.last, Date.now()))`. `runRefresh`: `timer = null`, `last = Date.now()`, `busy = true`, `reply = await FarmApi.listRooms()`; when `alive`, apply `takeLive` (list: `rooms = takeLive(rooms, reply)` and repaint the chips; page: 5.5 row "Refresh"). A failure changes nothing and is not retried. Finally `busy = false`; when `queued`: `queued = false` and schedule as above. This timer is the module's only data timer. |
| `ApiError` | `FarmUi.errorText(err)` in the message line named per action; the page stays usable |

### 5.4 Rooms list (`#/rooms`)

| Element | Markup | Content |
|---|---|---|
| Heading row | `div.section-head`: `h2` `Rooms`, `span.tag#rlFeed` (`role="status"`) | Feed line |
| Cards | `div.contents#rlCards` | One card per room, `id` ascending |
| Room card | `article.card.room-card[data-room-id="<id>"]` | `h2` > `a[href="#/rooms/<id>"]` (name); `p.rc-crop` (`cropStageText`); `div.rc-values[data-t]` (`data-t` = the reading's `t`, empty when none) with three `div.rc-val[data-k="T"\|"RH"\|"CO2"]`, each `span.val` (`readingTexts`) and `span.chip` (`live.status[k]` with `FarmUi.paintChip`, hidden when `live.status` is `null`); `p.tag.rc-at` (`readingTexts().at`); `p.rc-machines` (`machineLines(...).join(' · ')`); `span.chip.rc-alarms` (`alarmChip(live.alarms)`); `p.rc-stopped` (hidden while `live.running`): `span.chip` (`stateChip`) and `button.btn.rc-restart` `Restart` |
| New room | `section.card.room-new`, `h2` `New room` | `input#nrName` (text, `maxlength="60"`, placeholder and label `Name`); `input#nrVolume` (number, `min="5"`, `max="5000"`, `step="1"`, value `ClimateSim.PLANT.room.volume`, label `Volume (m³)`); `select#nrVent` (label `Fan`; `supply` "Supply fan (filtered air in)" selected, `exhaust` "Exhaust fan (air out)"); `button.btn#nrCreate` `New room`; `span.tag` `A new room starts running on the server at once (simulated, default settings).`; `p.tag#rlMsg` (`role="status"`) |

| Moment | Action |
|---|---|
| Load (each `open`) | `rooms = await FarmApi.listRooms()`; render all cards. `ApiError`: `#rlMsg`. |
| `reading` | Room `data.room_id` (ignored when not listed), when its `live.reading` is `null` or `data.t >= live.reading.t`: `live.reading = data`; repaint that card's values, `data-t`, `rc-at`, machines. Then the status refresh (5.3). |
| `room` | `rooms = upsertRoom(rooms, data)`; render. |
| `event`, `alarm`, `settings` | Ignored |
| **Restart** | Button disabled; `room = await FarmApi.restartRoom(id)`; `rooms = upsertRoom(rooms, room)`; render. `ApiError`: `#rlMsg`, button enabled. |
| **New room** | `#nrCreate` disabled during the call; `room = await FarmApi.createRoom({ name: newRoomName(#nrName.value, rooms.length), volume: Number(#nrVolume.value), vent: #nrVent.value })`; `rooms = upsertRoom(rooms, room)`; render; empty `#nrName`; `#rlMsg` = `Created "<room.name>".` `ApiError`: `#rlMsg` (for example `Invalid room: …`). No client-side validation besides the HTML attributes. |

Chips change only from Room objects: the load, `room` events, the **Restart** reply and the status refresh.

### 5.5 Room page (`#/rooms/:id`)

Order in `el` (the 12-column grid):

| # | Element | Markup | Content |
|---|---|---|---|
| 1 | Header | `section.card.room-head` | `a[href="#/rooms"]` `All rooms`; `h2#rpName`; `span.tag#rpInfo` = `<volume> m³ · <Supply fan \| Exhaust fan> · <cropStageText>`; `span.chip#rpState` (`stateChip`); `span.chip#rpAlarms` (`alarmChip`); `button.btn#rpRestart` `Restart` (hidden while `live.running`); `span.tag#rpFeed` (`role="status"`, feed line); `p.tag#rpMsg` (`role="status"`) |
| 2 | Live values | `section.card.room-live` | `div.rp-val#rpT`, `#rpRH`, `#rpCO2`: label (`Temperature`, `Humidity`, `CO₂`), `span.val`, `span.chip` (`live.status.T` / `.RH` / `.CO2`, hidden when `null`); `p.tag#rpAt`; `p.tag#rpTargets` = `Targets now: <fmtNum(T,1)> °C · <fmtNum(RH,0)> % RH · CO₂ limit <fmtNum(CO2,0)> ppm` from `live.targets` (empty when `null`); `ul#rpMachines` (one `li` per `machineLines` line) |
| 3 | Chart window | `div.filters` | `div.seg#rpWinSeg` (`role="group"`, `aria-label="Chart time window"`): buttons `data-win` `3600` `1 h`, `21600` `6 h` (pressed at mount), `86400` `24 h`, `604800` `7 days` (`aria-pressed`); `span.tag` `Farm time (UTC+8). A gap means no readings were recorded.` |
| 4 | Charts | `div.contents#rpCharts` | `FarmCharts.createTrendCharts(#rpCharts, { keys: ['T', 'RH', 'C'], power: false, clock, status: k => (room && room.live && room.live.status) ? room.live.status[k] : null })` |
| 5 | Alarms | `section.card.alarms`, `h2.eyebrow` `Alarms` | `ul#rpAlarmList.al-list`: per Alarm `li[data-lvl=<level>]` with `span.ico` (`FarmUi.ICON[level]`), `span` (`main`), `span.al-state` (`state`), and when `canAck` a `button.btn` `Acknowledge`. None: `p.est-note` `No alarms.` |
| 6 | Event log | `section.card.log`, `h2.eyebrow` `Event log` | `ol#rpLog`: per Event `li[data-lvl=<level>]` with `time` (`clock.stamp(t)`), `span.ico` (`aria-hidden`), `span` (`text`); `button.btn#rpOlder` `Older` |
| 7 | Settings head | `div.section-head` | `h2` `Settings`; `span.tag#spCount`; `button.btn#spSave` `Save`; `button.btn#spDiscard` `Discard` (both disabled at start); `ul.room-msg#spMsg` (`role="status"`) |
| 8 | Settings panel | `div.contents#spHost` | The panel (row "Panel" below) |
| 9 | Versions | `section.card.room-versions`, `h2.eyebrow` `Settings versions` | `ol#rpVersions`, newest first: `span` (`versionText(v, clock, index === 0)`) and, on every row but the first, `button.btn` `Restore` with `aria-label` `Restore the version of <clock.stamp(saved_at)>` |
| 10 | Room details | `section.card.room-details`, `h2.eyebrow` `Room details` | `input#rdName` (text, `maxlength="60"`), `input#rdVolume` (number, 5–5000), `select#rdVent` (as `#nrVent`), `button.btn#rdSave` `Save details`, `button.btn#rdArchive` `Archive room`, `span.tag` `A new volume or vent restarts the room's loop.`, `p.tag#rdMsg` (`role="status"`) |

Page state (closure, reset at each mount): `id`, `room`, `base` (`null`), `saving` (`false`), `windowS` (21600), `points` (`[]`), `latest` (`null`), `events` (`[]`), `panel`, `charts`, `ladder`, `alive` (`true`), `loadSeq` (0), `loading`, `early`, `refresh` (`{ timer: null, busy: false, queued: false, last: null }`). `NO_CHIPS` = `{ fan: null, ac: null }`; `tg()` = `chartTargets(room ? room.live : null, base)`. Every panel and ladder step is skipped while the panel does not exist (its `getSettings` failed); the reconnect load then creates it as the first load does.

| Moment | Action |
|---|---|
| First load (`reconnect: false`) | In parallel: (a) `listRooms()` row with `id`; **no row**: replace `el`'s content with `p.est-note` `This room does not exist or is archived.` and `a[href="#/rooms"]` `All rooms`, close the stream, stop (C5 3.4). Else `room = row`, `latest = room.live ? room.live.reading : null`, paint header, live values, details form. (b) `loadReadings()`. (c) `getAlarms(id)` → render. (d) `getEvents(id, { limit: 100 })` → `events` (merged with `mergeEvent`), render; empty page hides `#rpOlder`. (e) `base = await getSettings(id)`; create the panel; `listSettingsHistory(id)` → render. Each failure: `errorText` in `#rpMsg`; the rest still loads. |
| `loadReadings()` | `seq = ++loadSeq`; `q = windowQuery(windowS, now)`; `rows = await getReadings(id, q)`; dropped when `seq !== loadSeq` or not `alive`; merge each `toChartPoint(row, tg())` with `mergePoints(points, …, q.from)`; draw. |
| Draw | `charts.draw({ t0: now − windowS, t1: now, pts: points, gapS: gapFor(windowQuery(windowS, now).step) })` |
| Window button | Set `aria-pressed`; `windowS = data-win`; `points = []`; `loadReadings()` |
| `reading` (this room) | When `latest` is `null` or `data.t >= latest.t`: `latest = data`; repaint live values and machines; `ladder.draw(panel.get(), latest.CO2 ?? NaN, NO_CHIPS)`. Always: `points = mergePoints(points, toChartPoint(data, tg()), now − windowS)`; draw. Then the status refresh (5.3). |
| Refresh (5.3) | Skipped while `room` is `null`. `room = takeLive([room], reply)[0]`; repaint header chips, live chips, `#rpTargets`; `points = retarget(points, tg())`; draw. |
| `room` (this room) | `archived_at !== null`: the "does not exist or is archived" content, close the stream, stop. Else `room = data`; repaint header, chips, targets, the `program-status` slot; `points = retarget(points, tg())`; draw. Do not refill the details form while one of its inputs has focus. |
| `alarm` (this room) | Reload `getAlarms(id)`, render |
| `event` (this room) | `events = mergeEvent(events, data)`; render |
| `settings` (this room) | Ignored while `saving` (C6 7.9). Else `{ settings, kept } = rebase(base, panel.get(), data.settings)`; `base = data.settings`; `panel.set(settings)`; retarget and draw; reload versions; `kept > 0`: `#spMsg` = `The settings changed on the server; your <kept> change(s) are kept.`; `paintSave()`. |
| Reconnect load (`reconnect: true`) | In parallel: `listRooms()` row (same handling as the first load, missing row included); readings: `q = reconnectQuery(windowS, points.length ? points[points.length - 1].t : null, now)`: `null` → nothing; `merge: true` → `seq = ++loadSeq`, fetch `getReadings(id, q)`, merge each (dropped when `seq !== loadSeq`); `merge: false` → `points = []`, `loadReadings()`; alarms; events: `events = []` then the first page; versions; settings: `fresh = await getSettings(id)`; when not `saving`: `changed = diffSettings(base, fresh).length`; `{ settings, kept } = rebase(base, panel.get(), fresh)`; `base = fresh`; `panel.set(settings)`; retarget and draw; when `changed > 0` and `kept > 0`, the `#spMsg` text of the `settings` row; `paintSave()`. While `saving`: only the versions reload (C6 7.9). |
| Panel | Created once, after the first `getSettings`: `createSettingsPanel(#spHost, { settings: base, readOnly: false, getCommand: () => commandFromReading(latest), onChange })`. Slot `program-status`: a `p.prog-status` `` `Running now: ${cropStageText(room.live)}` `` (empty when `—`), updated on each `room` event. Slot `rules-side`: `ladder = FarmCharts.createLadder(slot)`, drawn with `ladder.draw(panel.get(), latest ? latest.CO2 ?? NaN : NaN, NO_CHIPS)` after creation, on each `onChange`, each `reading` and each `panel.set`. Other slots empty. If `web/charts.js` needs `chips` itself to be `null`, pass `null` and report it. |
| `paintSave()` | `n = panel.diff(base).length`; `#spCount` = `countText(n)`; `#spSave`, `#spDiscard` disabled when `n === 0` or `saving`; every **Restore** disabled while `saving`. Called after `onChange`, every `panel.set`, and each change of `saving`. |
| `onChange` | `paintSave()`; redraw the ladder |
| **Save** | C6 7.9: `changes = panel.diff(base)`; `note = await FarmSettingsPanel.showChanges(changes, { title: 'Save these changes to <room.name>?', confirmText: 'Save', note: true })`; `null` → nothing. `sent = panel.get()`; `saving = true`; `paintSave()`; `{ settings, warnings } = await FarmApi.saveSettings(id, sent, note)`; `base = settings`; `panel.set(rebase(sent, panel.get(), settings).settings)`; `#spMsg` = one `li` per warning, or one `li` `Saved.`; reload versions; retarget and draw. `ApiError`: `#spMsg` = `errorText`, edits kept. Finally `saving = false`; `paintSave()`. |
| **Discard** | `panel.set(base)`; empty `#spMsg`; `paintSave()` |
| **Restore** | `confirm('Make the version of <clock.stamp(saved_at)> current? Unsaved changes are lost.')`; cancel → nothing. `saving = true`; `paintSave()`; `{ settings, warnings } = await FarmApi.restoreSettings(id, v.id)`; `old = base`; `base = settings`; `panel.set(settings)`; `#spMsg` = one `li` per warning, then one `li` per `changeLines(diffSettings(old, settings))`; reload versions; retarget and draw. `ApiError`: `#spMsg`. Finally `saving = false`; `paintSave()`. |
| **Acknowledge** | Button disabled; `await FarmApi.ackAlarm(id, a.alarm_key)`; reload alarms. `ApiError`: `#rpMsg`, button enabled. |
| **Older** | Button disabled; `page = await getEvents(id, { limit: 100, before: <smallest id in events> })`; merge each; render; empty page hides `#rpOlder`, else enable it |
| **Restart** | Button disabled; `room = await restartRoom(id)`; repaint header, live values, chips; retarget and draw (a loop that fails again still answers 200 with `live.running: false`, C3 6.19). `ApiError`: `#rpMsg`, button enabled. |
| **Save details** | `changes = detailChanges(room, { name: #rdName.value, volume: #rdVolume.value, vent: #rdVent.value })`; `{}` → `#rdMsg` = `Nothing to change.`; else `room = await updateRoom(id, changes)`; repaint; `#rdMsg` = `Saved.` `ApiError`: `#rdMsg`. |
| **Archive room** | `confirm('Archive "<room.name>"? Its loop stops and it leaves the Rooms list. Its data is kept.')`; OK → `await updateRoom(id, { archived: true })` (never with other fields); `location.hash = '#/rooms'`. `ApiError`: `#rdMsg`. |
| Leaving | Unsaved edits are dropped without a prompt (C6 7.9) |

### 5.6 Unmount

Each step in its own `try { … } catch (e) { console.error(e); }`, so `unmount` never throws and is safe when nothing was mounted.

| Step | Action |
|---|---|
| 1 | `alive = false` (every pending `await` checks it and returns without touching the DOM) |
| 2 | `close()` the stream; `clearTimeout(refresh.timer)` |
| 3 | `panel.destroy()`, `charts.destroy()`, `ladder.destroy()` (those created) |
| 4 | Close an open `showChanges` dialog (`document.querySelector('body > dialog[open]')`); its result is ignored |

### 5.7 CSS (appended `/* Rooms */` block)

Reuse today's classes (`card`, `chip`, `tag`, `btn`, `seg`, `section-head`, `filters`, `alarms`, `al-list`, `log`, `est-note`, `prog-status`, `contents`). Add only:

| Selector | Rule |
|---|---|
| `.room-card`, `.room-new` | `grid-column: span 4`; `span 6` under 1100 px; `span 12` under 720 px |
| `.room-head`, `.room-live` | `grid-column: span 12`; wrapping flex rows |
| `.room-versions`, `.room-details` | `grid-column: span 6`; `span 12` under 1100 px |
| `.rc-values`, `.room-live .rp-val` | Large mono values (as `.readv`), chip beside |
| `.room-msg` | `grid-column: 1 / -1`; no bullets; muted 14 px text |

No `!important`; both themes through the existing variables.

## 6. Tasks (TDD: failing test first)

Test file `tests/web-rooms.test.js` (run by `npm test`). Header:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
require('../controller.js');
require('../web/ui.js');
require('../web/settings-panel.js');
let registered = null;
globalThis.FarmShell = { register: (name, mod) => { registered = { name, mod }; } };
require('../web/rooms.js');
const L = registered.mod.logic;
const CC = globalThis.ClimateController, clock = globalThis.FarmUi.farmClock();
const READING = { room_id: 1, t: 1791450000, T: 18.2, RH: 88.4, CO2: 812, t_out: 31.5, rh_out: 62,
  ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, fan: 1, lights: 1, circ: 0, power_w: 1430, kwh: 12.84 };
const TG = { spT: 18, spRH: 88, co2Lim: 1000, fanOn: 900, fanOff: 700 };
```

`1791450000` is `2026-10-08 17:00:00` farm time. `defaultSettings()`: `spT` 25, `spRH` 88, `co2Lim` 1000, `rules.fanOn` 900, `rules.fanOff` 700, crop `oyster` (`Grey oyster`), stage `fruiting` (`Fruiting`).

Per task: write the tests; run `node --disable-warning=ExperimentalWarning --test tests/web-rooms.test.js` and see them fail for the right reason; implement; see them pass; `npm test`; commit.

| # | Task | Test (in `tests/web-rooms.test.js`) | Proves |
|---|---|---|---|
| 1 | Skeleton: wrapper, `register('rooms', { mount, unmount, logic })` | `registers the rooms module` | `registered.name === 'rooms'`; `mount`, `unmount` functions; `logic` an object; loading did no DOM work (Node has no `document`) |
| | | `unmount before mount does not throw` | `registered.mod.unmount()` returns |
| 2 | `windowQuery`, `gapFor`, `reconnectQuery` | `windowQuery gives the C5 3.4 steps` | `(3600, 10000)` → `{ from: 6400, to: 10000, step: undefined }`; 21600 no step; 86400 → 120; 604800 → 900; 7200 throws `RangeError` |
| | | `gapFor is 3 × max(30, step)` | `undefined` → 90; 120 → 360; 900 → 2700 |
| | | `reconnectQuery follows C4 10.4` | `(3600, 9000, 10000)` → `{ from: 9001, to: 10000, step: undefined, merge: true }`; `(3600, 1000, 10000)` → `from` 6400; `(3600, 10000, 10000)` → `null`; `(3600, null, 10000)` → whole window, `merge: false`; `(86400, 9000, 10000)` → `{ from: -76400, to: 10000, step: 120, merge: false }` |
| 3 | `chartTargets`, `toChartPoint`, `retarget`, `mergePoints` | `chartTargets prefers live targets` | `targets { T: 18, RH: 88, CO2: 1000 }` with defaults → `TG`; `targets: null` → `spT` 25; `(null, null)` → all `NaN` |
| | | `toChartPoint maps a Reading` | `toChartPoint(READING, TG)` deep-equals `{ t: 1791450000, T: 18.2, RH: 88.4, C: 812, tOut: 31.5, rhOut: 62, spT: 18, spRH: 88, co2Lim: 1000, fanOn: 900, fanOff: 700 }` |
| | | `toChartPoint hides missing and implausible values` | `{ ...READING, T: null, CO2: 20000, rh_out: -5 }` → `T`, `C`, `rhOut` `NaN`; the rest unchanged |
| | | `retarget sets the targets of now on every point` | Both points carry `TG`; input unchanged |
| | | `mergePoints keeps order, replaces same t, drops old` | `[{t:10},{t:40}]` + `{t:25}` (from 0) → 10, 25, 40; + `{t:40, T:1}` → length 2, last `T` 1; from 20 drops 10; `{t:5}` from 20 not added; input unchanged |
| 4 | `upsertRoom`, `takeLive`, `refreshDelay` | `upsertRoom adds, replaces and removes` | `[r1, r3]` + `r2` → 1, 2, 3; renamed `r3` replaced; `r1` with `archived_at: 5` → 2, 3; archived unknown id → unchanged; input unchanged |
| | | `takeLive copies status and targets only` | Reply row with new `status`, `targets` and another `reading`: the result has the new `status` and `targets`, the old `reading`; a room absent from the reply is the same object; a reply-only room is not added; input unchanged |
| | | `refreshDelay waits out 30 s` | `(null, 5)` → 0; `(1000, 11000)` → 20000; `(1000, 40000)` → 0 |
| 5 | `readingTexts`, `machineLines`, `cropStageText`, `stateChip`, `alarmChip`, `newRoomName` | `readingTexts formats the live values` | `READING` → `{ T: '18.2 °C', RH: '88 % RH', CO2: '812 ppm', at: 'Reading at 2026-10-08 17:00:00' }`; `null` → `—` ×3 and `No reading yet` |
| | | `machineLines describes the machines` | `(READING, 'supply')` → `['AC Cool 17.5 °C', 'Fogger level 1', 'Supply fan Low', 'Lights on', 'Circulation fan off', 'Power 1.43 kW']`; `({ ...READING, ac_mode: 'off', ac_setpoint: null, fog: 0, fan: 0, lights: 0, circ: 1, power_w: null }, 'exhaust')` → `['AC off', 'Fogger off', 'Exhaust fan off', 'Lights off', 'Circulation fan on']`; `null` → `[]` |
| | | `cropStageText names crop and stage` | `{ crop: 'oyster', stage: 'fruiting' }` → `Grey oyster · Fruiting`; `null` and `{ crop: null }` → `—` |
| | | `stateChip and alarmChip` | Running → `Running` `good`; `{ running: false, error: 'boom' }` → `Stopped: boom` `serious`; `null` → `null`; `alarmChip(0)` → `No active alarms`; `alarmChip(2)` → `2 active alarm(s)` `warning` |
| | | `newRoomName defaults to Room n+1` | `('  ', 2)` → `Room 3`; `(' Shed ', 2)` → `Shed` |
| 6 | `commandFromReading`, `alarmTexts`, `mergeEvent`, `detailChanges`, `countText`, `versionText`, `changeLines` | `commandFromReading follows C6 7.9` | `READING` → `{ ac: { power: true, mode: 'cool', setpoint: 17.5 }, hu: { level: 1 }, fan: { level: 1 }, lights: { on: true }, circ: { on: false } }`; AC off → `ac` deep-equals `{ power: false }`; `null` → `null` |
| | | `alarmTexts for active and cleared alarms` | C3 3.4 example → `main` `High humidity · since 2026-10-08 17:00:12`, `state` `Active · not acknowledged`, `canAck` true; `cleared_at: 1791450600, acked_at: 1791450700` → `Cleared 2026-10-08 17:10:00 · acknowledged`, `canAck` false; cleared, not acknowledged → `canAck` true |
| | | `mergeEvent keeps id order without duplicates` | `[{id:5},{id:3}]` + `{id:6}` → 6, 5, 3; + `{id:5}` → unchanged; + `{id:4}` → 5, 4, 3; input unchanged |
| | | `detailChanges sends only changed fields` | Room `{ name: 'Room 1', volume: 60, vent: 'supply' }`, form `{ name: ' Room 1 ', volume: '60', vent: 'supply' }` → `{}`; form `{ name: 'Shed A', volume: '80', vent: 'exhaust' }` → `{ name: 'Shed A', volume: 80, vent: 'exhaust' }` |
| | | `countText, versionText, changeLines` | `countText(0)` `''`, `(1)` `1 unsaved change(s)`; `versionText({ id: 14, saved_at: 1791450100, note: 'Lower RH' }, clock, true)` → `2026-10-08 17:01:40 · Lower RH · current`; note `null`, not current → `2026-10-08 17:01:40 · —`; `changeLines(diffSettings(defaults, { ...defaults, spT: 20 }))` → `['Temperature target: 25 °C → 20 °C']` |
| 7 | `rebase` | `rebase keeps unsaved edits on new server settings` | `from` defaults, `edited` `spT` 20, `to` `spRH` 90 → `spT` 20 and `spRH` 90, `kept` 1 |
| | | `rebase without edits gives the server settings` | `edited` equal to `from` → `settings` deep-equals `to`, `kept` 0 |
| | | `rebase: the user's edit wins on the same setting` | `edited` `spT` 20, `to` `spT` 22 → 20 |
| | | `rebase does not change its arguments` | Inputs deep-equal their copies afterwards |
| 8 | List DOM (5.3, 5.4): stream, load queue, cards, status refresh, Restart, New room | No Node test (no DOM). Keep every decision in tested `logic`. | Headless A1–A5, F1 |
| 9 | Page: header, live values, missing-room content, window and charts, refresh (5.5 to row `room`) | – | Headless B1–B3 |
| 10 | Alarms, Acknowledge, event log, Older | – | Headless B4–B6 |
| 11 | Settings: panel, slots, `paintSave`, Save, Discard, stream `settings`, versions, Restore | – | Headless C1–C5 |
| 12 | Details, Archive, page Restart, reconnect load, unmount (5.6) | – | Headless D1–D4, F2 |
| 13 | CSS block (5.7) | – | Headless E1 |
| 14 | Full verification (section 7) and every headless row (section 8) | – | – |

## 7. How to verify

| Command | Expected |
|---|---|
| `node --disable-warning=ExperimentalWarning --test tests/web-rooms.test.js` | 27 tests or more, all pass |
| `npm test` | Green; passing = baseline + your new tests; nothing skipped or removed |
| `node --disable-warning=ExperimentalWarning --test tests/vectors.test.js` | 8 tests, all pass (the 8 recorded controller runs) |
| `git diff --exit-code master -- tests/vectors/` | No output, exit 0 |
| `git diff --name-only master` | Exactly `styles.css`, `tests/web-rooms.test.js`, `web/rooms.js` |
| `git diff master -- styles.css` | Only added lines, after the last existing line, starting with `/* Rooms */` |
| `grep -n "innerHTML" web/rooms.js` | Only the template assignments of a mount and the missing-room content (no dynamic text in them) |
| `grep -n "setTimeout\|setInterval" web/rooms.js` | Only the status refresh timer of 5.3 |
| `node -e "globalThis.FarmShell={register(){}};require('./web/rooms.js')"` | No output, exit 0 |

## 8. Headless Chrome checks (C6 7.10)

Drive Chrome with the chrome-devtools MCP tools (`navigate_page`, `wait_for`, `click`, `fill`, `evaluate_script`, `handle_dialog`, `list_console_messages`, `list_network_requests`). Without them, use `google-chrome-stable --headless=new --remote-debugging-port=9222` and a small CDP script in `/tmp`.

### 8.1 Against the real server

```sh
TMP=$(mktemp -d); FARM_HOST=127.0.0.1 FARM_PORT=8765 FARM_DB=$TMP/farm.db npm start
```

Open `http://127.0.0.1:8765/`. The new database gets the demo room `Room 1` (id 1), which records a reading every 30 s. Seed with `curl` where a row says so (`API=http://127.0.0.1:8765/api`).

| # | Step | Expected |
|---|---|---|
| A1 | Open `#/rooms` | One `article.room-card[data-room-id="1"]` `Room 1`; `Grey oyster · Fruiting`; T, RH, CO₂ numbers (not `—`) with chips; machines line; `No active alarms` |
| A2 | Note `.rc-values` `data-t`; wait up to 35 s | `data-t` changes; no page reload |
| A3 | Note the T chip text. `curl -X PUT $API/rooms/1/settings -d '{"settings":{"spT":12},"note":"headless status"}'`; wait up to 65 s | The T chip text changes without a page reload (the next reading, then the `listRooms()` refresh); `list_network_requests` shows at most one `GET /api/rooms` per 30 s after the load |
| A4 | `#nrName` `Shed B`, `#nrVolume` 80, `#nrVent` `exhaust`, click `#nrCreate` | Card `Shed B` appears in id order; `#rlMsg` = `Created "Shed B".`; `GET $API/rooms` lists it |
| A5 | `#nrVolume` 4, click `#nrCreate` | `#rlMsg` starts with `Invalid room:`; no new card |
| B1 | Open `#/rooms/1` | `#rpName` `Room 1`; `#rpState` `Running`; `#rpRestart` hidden; live values; six `#rpMachines` items; three `svg.chart` in `#rpCharts` |
| B2 | Click `24 h` | Request `GET /api/rooms/1/readings?from=…&to=…&step=120`; button pressed; charts redraw |
| B3 | Open `#/rooms/999` | Only `This room does not exist or is archived.` and the `All rooms` link |
| B4 | On `#/rooms/1`: `#rpLog` | Rows `Room created` and `Started`, newest first, farm-time stamps |
| B5 | Click `#rpOlder` | Request has `before=<smallest id shown>`; empty page hides `#rpOlder` |
| B6 | `curl -X PUT $API/rooms/1/settings -d '{"settings":{"rules":{"co2Safety":true,"co2SafetyAt":500}}}'`; wait up to 180 s | `CO₂ at safety level` row in `#rpAlarmList` with **Acknowledge**; `#rpAlarms` `1 active alarm(s)` (or the row is cleared, not acknowledged). Click **Acknowledge**: the row says `acknowledged`, no button; `#rpLog` gains `Acknowledged: CO₂ at safety level` |
| C1 | Click `Installer` in `#levelSeg`; set `#inSpT` to 20 (`value = 20`, dispatch `input`) | `#spCount` `1 unsaved change(s)`; **Save** and **Discard** enabled |
| C2 | Click **Save**; type `headless check`; confirm | Dialog listed `Temperature target: 12 °C → 20 °C`; `#spMsg` `Saved.` (or warnings); top `#rpVersions` row ends `headless check · current`; `GET $API/rooms/1/settings` has `spT` 20; `#spCount` empty |
| C3 | Change `#inSpRH` (unsaved); `curl -X PUT $API/rooms/1/settings -d '{"settings":{"co2Lim":1200}}'` | `#spMsg` `The settings changed on the server; your 1 change(s) are kept.`; `#spCount` still `1 unsaved change(s)`; panel shows `co2Lim` 1200; versions reloaded |
| C4 | Click **Discard** | Panel shows the server's settings; `#spCount` empty; buttons disabled |
| C5 | **Restore** on the row with note `Created`; accept | `#spMsg` lists `Temperature target: 20 °C → 25 °C` and the other restored changes; top note `Restored version <id>`; `GET …/settings` equals the restored values |
| D1 | On `#/rooms/<Shed B id>`: `#rdName` `Shed C`, **Save details**; then **Save details** again | `#rdMsg` `Saved.`, header `Shed C`; then `Nothing to change.` |
| D2 | **Archive room**, accept | Hash `#/rooms`; no `Shed C` card; `GET $API/rooms` does not list it |
| D3 | On `#/rooms/1`: stop the server (SIGINT), wait 5 s, start it with the same `FARM_DB` | `#rpFeed` shows `Live feed lost: … Reconnecting…`, then empties; readings arrive again; log shows `Stopped` and `Resumed after <N> min stopped`; no duplicate event rows |
| D4 | `#/rooms/1` → `#/simulator` → `#/rooms` → `#/rooms/1` | No console error; the left page's stream request is closed; no `dialog` left open |
| E1 | Light and dark (`#themeBtn`); 375 px and 1280 px wide | List and page readable; nothing overflows |
| E2 | `list_console_messages` for the whole session | No errors; no 404 (except `/favicon.ico`) |

### 8.2 Restart against the fake (lead decision 5)

A script in `/tmp` runs `api = await startFakeApi({ root: <worktree> })` (from `<worktree>/tests/fakes/api-server.js`), sets the replies below before the page loads, prints `api.url`, and prints each new `/api/` entry of `api.requests` as one JSON line. `R` = `{ id: 1, name: 'Room 1', volume: 60, vent: 'supply', adapter: 'sim', created_at: 1791446400, archived_at: null, live: { reading: null, stage: 'fruiting', crop: 'oyster', targets: null, status: null, alarms: 0, running: false, error: 'boom' } }`; `R2` = `R` with `live.running: true`, `live.error: null`. Replies: `GET /api/rooms` → 200 `[R]`; `POST /api/rooms/1/restart` → 200 `R2`; `GET /api/rooms/1/settings` → 200 `ClimateController.defaultSettings()`. The fake sends no `: ping`, so finish each row within 45 s of opening the page (or expect one `down` and reload).

| # | Step | Expected |
|---|---|---|
| F1 | Open `<api.url>/#/rooms`; click `.rc-restart` | Before: the card shows `Stopped: boom` and **Restart**. Exactly one `POST /api/rooms/1/restart` with `body` `null`. After: no `Stopped`, no `boom`, no **Restart** |
| F2 | Open `<api.url>/#/rooms/1` (the fake still answers `[R]`); click `#rpRestart` | Before: `#rpState` `Stopped: boom`, `#rpRestart` visible. Exactly one more `POST /api/rooms/1/restart`, `body` `null`. After: `#rpState` `Running`, `#rpRestart` hidden. No console errors |

## 9. Done when

- [ ] `web/rooms.js` replaces the stub, registers `rooms` with `mount`, `unmount`, `logic`, defines no global, does no DOM work at load.
- [ ] Every function of 5.2 is in `logic`, behaves as its row says, and is tested in `tests/web-rooms.test.js`.
- [ ] List and page use exactly the ids, texts and behaviour of 5.3–5.6, including the load queue and the status refresh.
- [ ] Settings follow C6 7.9 (Save with change list and note, Discard, `saving`, stream `settings` rebase, reconnect rebase, Restore with confirm and change lines).
- [ ] Data comes only through `FarmApi` and the stream; the only timer is the status refresh; no `localStorage`, no direct `fetch`.
- [ ] `unmount` stops the stream, the refresh timer, panel, charts, ladder and any open dialog, and never throws.
- [ ] `npm test` green with baseline + new tests; 8 vector tests pass; `tests/vectors/` unchanged.
- [ ] `git diff --name-only master` lists only the three owned files; `styles.css` only gains the `/* Rooms */` block.
- [ ] Every row of section 8 passes with no console errors.
- [ ] The report of section 11 is sent.

## 10. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 3, or change or reorder an existing CSS rule | File ownership (spec section 6) |
| Add a global, npm package, bundler, `type="module"` or framework | C5 1.4 |
| Put dynamic text into `innerHTML` | C5 1.4 (names and texts come from users and the server) |
| Compute targets, status chips or alarms in the browser, or create a controller, or call `ClimateController.applySettings` | The server runs the controller; lead decision 6; C6 7.9 |
| Add any timer besides the status refresh, refresh more than once per 30 s, refresh without a `reading`, or open more than one stream per mount | C5 3.4; C4 10.3 |
| Load data before the stream's `open` | C4 10.3 |
| Send `archived: true` with other fields, or unchanged fields in a `PATCH` | C5 4.3 |
| Restore through `saveSettings` | C3 6.7 (own route, own note) |
| Prompt before leaving with unsaved edits | C6 7.9 |
| Write `localStorage`, change `document.body` attributes or the shell's elements | C5 3.1 |
| Change a contract, a fake or another stream's file, or work around a gap | Contracts change only through the lead |
| Push, merge, rebase, or change git config | The lead merges after review |

## 11. Report back to the lead

| Item | Content |
|---|---|
| Result | Done or blocked; the commit list |
| Tests | `npm test` counts before and after; the vectors output; `git diff --name-only master` |
| Headless checks | One line per row of section 8: pass or fail, with what you saw |
| Stream decisions to confirm | (1) `logic` on the registered object (5.1); (2) the ids and texts of 5.4–5.5; (3) the load queue `early` (5.3); (4) the `createLadder` "no chips" form found in `web/charts.js` |
| Anything else | Every contract gap or mismatch met, and what you did instead of guessing |

# Work brief: Live tab (`web/room-live.js`)

Revision 1, 2026-10-09 (wave 2, written in prep 2.0 from the frozen contracts on `master` e60dabf). Stream: **Live tab**. Implementer on Sonnet; the reviews (spec compliance, then code quality) run on Opus before the lead merges.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–69 (here: 1, 2, 4, 6, 16, 20, 27) | `docs/contracts/LEAD-DECISIONS.md` | They override this brief and every contract text |
| C5 and C6 revision 8 | `docs/contracts/web.md` | 1.4, 3.1, 3.4 (with the table "Air exchange on the Live tab"), 3.9, 4.3, 5, 6.1–6.3 (`createTrendCharts`, `createLadder`), 7.2–7.6, 7.9, 7.10 rows "how wave 2 checks run" and "Live tab" |
| C9 revision 2 (air exchange) | `docs/contracts/air.md` | Section 7 (status card, glance row, ladder chip texts), 5.3 (the states), 7.1 labels; read-only |
| C3 and C4 revision 9 | `docs/contracts/api.md` | 3.1 Room and `live.air`, 3.2 Reading (18 keys, `air` 0/1), 3.3–3.5, 6.3–6.11, 10 (stream events, reconnect rule 10.4) |
| C2 revision 9 | `docs/contracts/rooms.md` | 5.2 `Live.air` (how each field is built); section 7 (when `room` events come) |
| Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Sections 3 (Live tab row), 3.1, 4, 5 |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/room-live.md` | Committed on `master` by the lead in prep 2.0; you do not edit it |

## 1. Goal

| Outcome | Measure |
|---|---|
| The Live tab of a room | Replaces the prep 2.0 stub `web/room-live.js`; registers tab `live` with `FarmRoomTabs`; shows the room now (values, machines, status chips, targets), the air exchange (status card, glance row, purge ladder chip from `live.air`), history charts, alarms with **Acknowledge**, the event log with **Older**, the settings editor (**Save**, **Discard**, versions, **Restore**) and the room details (rename, volume, **Archive**) |
| Live through the frame | Every stream event comes through `ctx.on` (C5 3.9); the Room through `ctx.room()` and the `room` listener; no stream, no `listRooms()` call and no data timer of its own |
| The air exchange texts | `airLive(air, settings)` gives exactly the C5 3.4 table rows; the hourly purge bars (`drawPurgeBars`) stay in the Test bench in wave 2 |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/room-live` (below `<worktree>`), on branch `stream/room-live`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm`. |
| Git | Keep the configured identity (never change `git config`). Plain commit messages such as `feat(room-live): …`, `test(room-live): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase; never merge `master` into your branch. |
| Gate 2.5 | Your headless check needs the real server with `live.air` and the 18-key readings: it runs only after the lead's gate 2.5 (wave 2 plan 5). Do tasks 0–9, commit, tell the lead you wait for gate 2.5, then run task 10 when the lead says it passed. |

| Check (from `<worktree>`) | Expected; otherwise stop and report to the lead |
|---|---|
| `git branch --show-current` | `stream/room-live` |
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` (C5 1.6) | All three listed |
| `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js web/batches.js web/harvest.js web/harvest.css` (C5 1.7) | All eight listed |
| `grep -c 'web/room-tabs.js' index.html` (C5 1.7) | `1` |
| `cat web/room-live.js` | The prep 2.0 stub: the C5 1.4 wrapper, registering nothing |
| `node -e "require('./web/room-tabs.js'); console.log(FarmRoomTabs.NAMES.join(','))"` | `live,simulate,calibrate` |
| `grep -c "drawPurgeBars\|createLadder" web/charts.js` | At least `2` (C9's charts are on `master`) |
| `npm test` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `K0` |

Read before you code: `web/room-tabs.js`, `web/api.js`, `web/ui.js`, `web/charts.js` (`createTrendCharts`, `createLadder` and its `chips = { air }`), `web/settings-panel.js` (`createSettingsPanel`, `diffSettings`, `applyChanges`, `showChanges`, the slots), and in `web/simulator.js` the function `airText` (C9's Test bench texts; the Live tab has its own pure copy reading `live.air`, see 5.2).

## 3. Owned files (the only files you may touch; wave 2 plan 3, Live tab row)

| File | Action | Content |
|---|---|---|
| `web/room-live.js` | Replace the prep 2.0 stub | The tab (section 5) |
| `tests/web-room-live.test.js` | Create | Section 6 |

| Not yours | Owner |
|---|---|
| `web/rooms.js` (the frame that mounts you and builds `ctx`), `web/shell.js`, `styles.css` (your classes are in the Room shell's `/* Room page */` block) | Room shell |
| `web/room-tabs.js`, `web/api.js`, `index.html`, `tests/fakes/*` | Lead (prep 2.0) |
| `web/charts.js` (only the `drawCalibCharts` options are changed in wave 2) | Calibrate tab |
| `web/settings-panel.js` (only the lion's mane `<option>`) | Equipment |
| `web/simulator.js` (`airText`, `drawPurgeBars` use) | Bench, and nobody for C9's air card code |
| Everything else | Read-only |

| Rule | Detail |
|---|---|
| CSS | You add no CSS. Use the classes of C5 3.8 (`.room-live`, `.room-air`, `.room-versions`, `.room-details`, `.room-msg`) and today's classes (`card`, `chip`, `tag`, `btn`, `seg`, `section-head`, `filters`, `alarms`, `al-list`, `log`, `est-note`, `prog-status`, `contents`, `eyebrow`) |
| Blocked | If something outside your files blocks you, stop that part and report it to the lead |

## 4. What you build against

| Source | What you take from it |
|---|---|
| C5 3.9 | The tab object (`mount(el, ctx)`, `unmount()`, `helpers`), `ctx` (`id`, `params`, `room()`, `on(type, fn) → off()`), the event types (`reading`, `event`, `alarm`, `settings`, `room`, `open` with `{ reconnect }` on reconnects only, `down`) |
| C5 3.4 | Every row of "Live tab data flow"; Reading → `ChartPoint` (with `core`); targets from `live.targets`, else the settings; `gapS`; the chart windows and steps; the reconnect reloads; the table "Air exchange on the Live tab" and the parts table below it |
| C5 7.9 | The settings panel on a live room: `base`, `saving`, the Command from a Reading (`air.on` = `r.air === 1`), **Save**, **Discard**, stream `settings`, reconnect, **Restore**, the slots (`program-status` with ` · flush <n>`, `rules-side` with the ladder chip from `live.air`) |
| C5 6.3, 6.2 | `createTrendCharts(el, { keys, power: false, clock, status })`; `createLadder(el).draw(settings, co2, { air: Chip \| null })` |
| C5 7.2–7.6 | `createSettingsPanel`, `diffSettings`, `applyChanges`, `formatValue`, `showChanges` (C6) |
| C9 7 | The texts and the rule order of the status card, glance row and ladder chip |
| C3 6.3, 6.5–6.11 | `updateRoom` (rename, volume, archive), `saveSettings`, `listSettingsHistory`, `restoreSettings`, `getReadings`, `getEvents`, `getAlarms`, `ackAlarm` |

| Lead decision | As it applies to this stream |
|---|---|
| 1, 20 | Readings are read with their 18 keys (`T`, `RH`, `CO2`, `t_out`, `rh_out`, `air`, `ac_fan`, `stage`, `core`, …); no renaming layer |
| 2 | `room` events come only on a C2 summary change; `live.status`, `live.targets`, `live.air` reach the tab through the frame's `listRooms()` refresh, passed as `room` |
| 4 | Reconnects are `FarmApi.stream`'s (through the frame); you reload on `open` with `reconnect: true` |
| 6 | The tab never calls `ClimateController.applySettings`; the server validates every save |
| 16 | The tab is its own file, registered in `FarmRoomTabs`; a tab switch unmounts it |
| 27 | `Live.air` drives the air exchange card, glance row and ladder chip with C9 7's texts; the hourly purge bars stay in the Test bench |

## 5. Design (fixed by this brief where the contracts leave it open)

### 5.1 Tab shape

| Item | Rule |
|---|---|
| Registration | At load, exactly one call: `global.FarmRoomTabs.register('live', { mount, unmount, helpers })`. No global |
| At load | No DOM, no `FarmApi` call, no timer. `ClimateController`, `FarmUi`, `FarmApi`, `FarmCharts`, `FarmSettingsPanel` are read inside functions |
| State (closure, reset at each `mount`) | `ctx`, `id`, `room`, `latest` (the newest Reading), `base` (`null`), `saving` (`false`), `windowS` (21600), `points` (`[]`), `events` (`[]`), `panel`, `charts`, `ladder`, `alive`, `loadSeq`, `offs` (the `off()` functions of `ctx.on`) |
| Clock | `FarmUi.farmClock()`; "now" = `Math.floor(Date.now() / 1000)` |

### 5.2 Pure helpers (`helpers`)

No helper changes its arguments or touches the DOM or network. `CC` = `ClimateController`. `TG` = `{ spT, spRH, co2Lim, fanOn, fanOff }`. `ms(s)` = `FarmUi.fmtMinSec(Math.round(s))`.

| Helper | Signature → result | Rule |
|---|---|---|
| `airLive(air, settings)` | `(Live.air \| null, Settings \| null) → { state, glance, chip, day }` | C5 3.4, the first row that applies wins (row numbers as the contract): **1** `on && reason === 'purge'`: `state` `Purge <ms(purgeS ?? 0)> of <ms(settings.rules.purgeMaxS)>` (without ` of …` when `settings` is `null`), `glance` `Purging <ms(purgeS ?? 0)>`, `chip` `{ lvl: 'info', icon: '▲', text: 'Purging' }`. **2** `on && reason === 'safety'`: both `Safety run`, chip `{ lvl: 'serious', icon: '◆', text: 'Safety run' }`. **3** `on`, other reason: text from `{ timed: 'Timed purge', 'free cooling': 'Free cooling', drying: 'Drying', manual: 'Manual on' }` (any other or `null` reason: `On`), both texts the same, chip `{ lvl: 'info', icon: '●', text }`. **4** `manual && manualOn`: both `Manual on`, chip `{ lvl: 'info', icon: '●', text: 'Manual on' }`. **5** `manual`: both `Manual off`, chip `{ lvl: 'none', icon: '○', text: 'Manual off' }`. **6** `delayed`: both `Delayed (humidity first)`, chip `{ lvl: 'info', icon: '❚❚', text: 'Delayed' }`. **7** `timed`: both `Timed purge · off`, chip `{ lvl: 'none', icon: '○', text: 'Idle' }`. **8** `nextPurgeS > 0`: `state` `Idle · purge in about <m> min`, `glance` `Next purge in about <m> min` with `m = max(1, ceil(nextPurgeS / 60))`, chip Idle. **9** otherwise: both `Idle`, chip Idle. `day` = `Purges <today.purges> · average <ms(today.avgS)>` (`–` for the average when `today.purges` is 0), plus ` · <today.capped> capped` when `today.capped > 0`. `air` `null`: `{ state: '–', glance: '–', chip: null, day: '' }` |
| `airSub(settings)` | `(Settings \| null) → string` | `SF-203 + EF-206 · <FarmUi.nf(settings.airM3h)> m³/h` (`1,800`); `null` settings: `SF-203 + EF-206` |
| `windowQuery(windowS, now)` | `→ { from, to, step }` | `from = now − windowS`, `to = now`; `step`: 3600 and 21600 → `undefined`, 86400 → 120, 604800 → 900 (C5 3.4). Other `windowS`: throws `RangeError('Unknown chart window <windowS>')` |
| `gapFor(step)` | `→ int` | `3 × max(30, step \|\| 0)` |
| `reconnectQuery(windowS, lastT, now)` | `→ { from, to, step, merge } \| null` | `windowS === 3600` and `lastT` finite: `{ from: max(lastT + 1, now − 3600), to: now, step: undefined, merge: true }`, or `null` when `from > to`. Otherwise `{ ...windowQuery(windowS, now), merge: false }` (C4 10.4) |
| `chartTargets(live, base)` | `→ TG` | `spT`, `spRH`, `co2Lim` = `live.targets.T`, `.RH`, `.CO2` when `live` and `live.targets` are set, else `base.spT`, `base.spRH`, `base.co2Lim`; `fanOn`, `fanOff` = `base.rules.fanOn`, `.fanOff`. No source: `NaN` |
| `toChartPoint(r, tg)` | `→ ChartPoint` | Exactly the keys `t, T, RH, C, tOut, rhOut, core, spT, spRH, co2Lim, fanOn, fanOff`. `T` ← `r.T`, `RH` ← `r.RH`, `C` ← `r.CO2`, `tOut` ← `r.t_out`, `rhOut` ← `r.rh_out`, `core` ← `r.core`, each `NaN` when `null`, not finite, or outside `CC.SENSORS[k]` `min`–`max` (`k` = `T`, `RH`, `CO2`, `tOut`, `rhOut`, `core`). Targets from `tg` |
| `retarget(pts, tg)` | `→ ChartPoint[]` | New array; every point gets the targets of `tg` |
| `mergePoints(pts, p, from)` | `→ ChartPoint[]` | New array, `t` ascending; points with `t < from` dropped; a point with `p.t` is replaced by `p`; `p` with `p.t < from` is not added |
| `mergeEvent(events, ev)` | `→ Event[]` | New array, `id` descending; an `id` already present: unchanged |
| `readingTexts(r, clock)` | `→ { T, RH, CO2, at }` | `` `${fmtNum(r.T, 1)} °C` ``, `` `${fmtNum(r.RH, 0)} % RH` ``, `` `${fmtNum(r.CO2, 0)} ppm` ``, `` `Reading at ${clock.stamp(r.t)}` ``. `r === null`: `—`, `—`, `—`, `No reading yet` |
| `machineLines(r)` | `→ string[]` | `null` → `[]`. In order: `AC off` when `ac_mode === 'off'`, else `` `AC ${AC_WORD[ac_mode] ?? ac_mode} ${fmtNum(ac_setpoint, 1)} °C` `` (`AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' }`); `Fogger off` / `Fogger level <fog>`; `Air exchange On` when `air === 1`, else `Air exchange Off` (C5 3.4: no level); `Lights on` / `Lights off`; `Circulation fan on` / `Circulation fan off`; `` `Power ${FarmUi.watts(power_w)}` `` only when `power_w` is finite |
| `commandFromReading(r)` | `→ Command \| null` | C5 7.9: `{ ac, hu: { level: r.fog }, air: { on: r.air === 1 }, lights: { on: r.lights === 1 }, circ: { on: r.circ === 1 } }`; `ac` = `{ power: true, mode: r.ac_mode, setpoint: r.ac_setpoint }` when `r.ac_mode !== 'off'`, else `{ power: false }` (no other key). `null` → `null` |
| `programText(live)` | `→ string` | The `program-status` slot: `''` when `live` or `live.crop` is `null`; else `Running now: <CROPS[crop].name> · <STAGES[stage]>` (the key when unknown), plus ` · flush <live.flush>` when it is set |
| `alarmTexts(a, clock)` | `→ { main, state, canAck }` | `main` = `` `${a.label} · since ${clock.stamp(a.raised_at)}` ``; `state` = (`Active` when `cleared_at === null`, else `` `Cleared ${clock.stamp(a.cleared_at)}` ``) + ` · ` + (`not acknowledged` / `acknowledged`); `canAck` = `acked_at === null` |
| `detailChanges(room, form)` | `→ object` | `form` = `{ name, volume }` (strings). Only what differs: `name` (trimmed) when `form.name.trim() !== room.name`; `volume` (`Number`) when `Number(form.volume) !== room.volume`. `{}` when nothing differs |
| `countText(n)` | `→ string` | `0`: `''`; else `` `${n} unsaved change(s)` `` |
| `changeLines(changes)` | `→ string[]` | `` `${c.label}: ${c.oldText} → ${c.newText}` `` (C6 7.5) |
| `versionText(v, clock, current)` | `→ string` | `` `${clock.stamp(v.saved_at)} · ${v.note ?? '—'}` ``, plus ` · current` when `current` |
| `rebase(from, edited, to)` | `→ { settings, kept }` | `pending = diffSettings(from, edited)`; `{ settings: applyChanges(to, pending), kept: pending.length }`: every C5 7.9 "keep the edits" step (Save reply: `rebase(sent, panel.get(), reply.settings)`; stream `settings`: `rebase(base, panel.get(), data.settings)`; reconnect: `rebase(base, panel.get(), fresh)`) |

### 5.3 Markup (order in `el`, the `#roomTab` host, `display: contents` in the 12-column grid)

| # | Element | Markup | Content |
|---|---|---|---|
| 1 | Live values | `section.card.room-live` | `div.rv#lvT`, `#lvRH`, `#lvCO2`: label (`Temperature`, `Humidity`, `CO₂`), `span.val`, `span.chip` (`live.status.T` / `.RH` / `.CO2`, hidden while `null`); `p.tag#lvAt`; `p.tag#lvTargets` = `Targets now: <fmtNum(T, 1)> °C · <fmtNum(RH, 0)> % RH · CO₂ limit <fmtNum(CO2, 0)> ppm` from `live.targets` (empty while `null`); `ul#lvMachines` (one `li` per `machineLines` line) |
| 2 | Air exchange card | `section.card.room-air` | `h3` `Air exchange`; `p.tag#airSub` (`airSub(base)`); `p#airState` (`airLive(...).state`); `p.tag#airWhy` (`live.air.why`, empty when `null` or no `live.air`) |
| 3 | Glance row | `div.room-air` | `span` `Air exchange`; `span#airGlance` (`.glance`); `span.tag#airDay` (`.day`) |
| 4 | Chart window | `div.filters` | `div.seg#lvWinSeg` (`role="group"`, `aria-label="Chart time window"`): buttons `data-win` `3600` `1 h`, `21600` `6 h` (pressed at mount), `86400` `24 h`, `604800` `7 days` (`aria-pressed`); `span.tag` `Farm time (UTC+8). A gap means no readings were recorded.` |
| 5 | Charts | `div.contents#lvCharts` | `FarmCharts.createTrendCharts(#lvCharts, { keys: ['T', 'RH', 'C'], power: false, clock, status: k => (room && room.live && room.live.status) ? room.live.status[k] : null })` |
| 6 | Alarms | `section.card.alarms`, `h2.eyebrow` `Alarms` | `ul#lvAlarmList.al-list`: per Alarm `li[data-lvl=<level>]` with `span.ico` (`FarmUi.ICON[level]`), `span` (`main`), `span.al-state` (`state`), and when `canAck` a `button.btn` `Acknowledge`. None: `p.est-note` `No alarms.` |
| 7 | Event log | `section.card.log`, `h2.eyebrow` `Event log` | `ol#lvLog`: per Event `li[data-lvl=<level>]` with `time` (`clock.stamp(t)`), `span.ico` (`aria-hidden`), `span` (`text`); `button.btn#lvOlder` `Older` |
| 8 | Settings head | `div.section-head` | `h2` `Settings`; `span.tag#spCount`; `button.btn#spSave` `Save`; `button.btn#spDiscard` `Discard` (both disabled at start); `ul.room-msg#spMsg` (`role="status"`) |
| 9 | Settings panel | `div.contents#spHost` | The panel (5.4 row "Panel") |
| 10 | Versions | `section.card.room-versions`, `h2.eyebrow` `Settings versions` | `ol#lvVersions`, newest first: `span` (`versionText(v, clock, index === 0)`) and, on every row but the first, `button.btn` `Restore` with `aria-label` `Restore the version of <clock.stamp(saved_at)>` |
| 11 | Room details | `section.card.room-details`, `h2.eyebrow` `Room details` | `label` `Name` + `input#rdName` (text, `maxlength="60"`), `label` `Volume (m³)` + `input#rdVolume` (number, 5–5000), `button.btn#rdSave` `Save details`, `button.btn#rdArchive` `Archive room`, `span.tag` `A new volume restarts the room's loop.`, `p.tag#rdMsg` (`role="status"`) |
| 12 | Message | `p.tag.room-msg#lvMsg` (`role="status"`) | Load errors (`FarmUi.errorText`) |

### 5.4 Behaviour

| Moment | Action |
|---|---|
| `mount(el, ctx)` | Markup; `room = ctx.room()`; `latest = room.live ? room.live.reading : null`; paint values, machines, chips, targets, air card and glance row, details form; register the listeners below with `ctx.on` (keep the `off`s); then load in parallel: (a) `loadReadings()`; (b) `getAlarms(id)` → render; (c) `getEvents(id, { limit: 100 })` → `events` (merged with `mergeEvent`), render, an empty page hides `#lvOlder`; (d) `base = await getSettings(id)`, create the panel, `listSettingsHistory(id)` → render; repaint the air card (it needs `base`). Each failure: `errorText` in `#lvMsg`; the rest still loads. The stream was open before the tab mounted (C5 3.9), so no load waits for an `open` |
| Events during the load | `reading` and `event` merge into what the load brings (`mergePoints`, `mergeEvent` are idempotent); `alarm` reloads the list; a `settings` event before `base` is set is kept and applied as the stream `settings` row right after `base` loads |
| `loadReadings()` | `seq = ++loadSeq`; `q = windowQuery(windowS, now)`; `rows = await getReadings(id, q)`; dropped when `seq !== loadSeq` or not `alive`; merge each `toChartPoint(row, tg())` with `mergePoints(points, …, q.from)`; draw. `tg()` = `chartTargets(room.live, base)` |
| Draw | `charts.draw({ t0: now − windowS, t1: now, pts: points, gapS: gapFor(windowQuery(windowS, now).step) })` |
| Window button | Set `aria-pressed`; `windowS = data-win`; `points = []`; `loadReadings()` |
| `reading` | When `latest` is `null` or `data.t >= latest.t`: `latest = data`; repaint values and machines; redraw the ladder. Always: `points = mergePoints(points, toChartPoint(data, tg()), now − windowS)`; draw. No `listRooms()` call: the frame refreshes and passes the Room |
| `room` | `room = data`; `latest` = the newer of `latest` and `room.live.reading`; repaint chips, `#lvTargets`, the air card, glance row, the ladder chip, the `program-status` slot, the details form (not while one of its inputs has focus); `points = retarget(points, tg())`; draw |
| `alarm` | Reload `getAlarms(id)`, render |
| `event` | `events = mergeEvent(events, data)`; render |
| `settings` | C5 7.9: ignored while `saving`. Else `{ settings, kept } = rebase(base, panel.get(), data.settings)`; `base = data.settings`; `panel.set(settings)`; repaint `#airSub` and the air card; retarget and draw; reload the versions; `kept > 0`: `#spMsg` = `The settings changed on the server; your <kept> change(s) are kept.`; `paintSave()` |
| `open` (`reconnect: true`) | C5 3.4 row "Reconnect" and 7.9: in parallel: readings `q = reconnectQuery(windowS, points.length ? points[points.length - 1].t : null, now)`: `null` → nothing; `merge: true` → fetch and merge (dropped when `seq !== loadSeq`); `merge: false` → `points = []`, `loadReadings()`; alarms; events: `events = []`, then the first page; versions; settings: `fresh = await getSettings(id)`; when not `saving`: `changed = diffSettings(base, fresh).length`; `{ settings, kept } = rebase(base, panel.get(), fresh)`; `base = fresh`; `panel.set(settings)`; when `changed > 0` and `kept > 0` the `#spMsg` text of the `settings` row; `paintSave()`. While `saving`: only the versions reload. Header and live values come from the frame's `room` |
| `down` | Nothing (the frame shows `Reconnecting…`) |
| Panel | Created once, after the first `getSettings`: `createSettingsPanel(#spHost, { settings: base, readOnly: false, getCommand: () => commandFromReading(latest), onChange })`. Slot `program-status`: `p.prog-status` = `programText(room.live)`. Slot `rules-side`: `ladder = FarmCharts.createLadder(<a div in the slot>)`, drawn with `ladder.draw(panel.get(), latest ? (latest.CO2 ?? NaN) : NaN, { air: airLive(room.live && room.live.air, base).chip })` (`chip` is `null` while `live.air` is `null`: no chip) after creation, on each `onChange`, `reading`, `room` and `panel.set`. Other slots empty. If the panel's `getSettings` failed, every panel and ladder step is skipped; the reconnect load then creates it |
| `paintSave()` | `n = panel.diff(base).length`; `#spCount` = `countText(n)`; `#spSave`, `#spDiscard` disabled when `n === 0` or `saving`; every **Restore** disabled while `saving`. Called after `onChange`, every `panel.set` and each change of `saving` |
| `onChange` | `paintSave()`; redraw the ladder |
| **Save** | C5 7.9: `changes = panel.diff(base)`; `note = await FarmSettingsPanel.showChanges(changes, { title: 'Save these changes to <room.name>?', confirmText: 'Save', note: true })`; `null` → nothing. `sent = panel.get()`; `saving = true`; `paintSave()`; `{ settings, warnings } = await saveSettings(id, sent, note)`; `base = settings`; `panel.set(rebase(sent, panel.get(), settings).settings)`; `#spMsg` = one `li` per warning, or one `li` `Saved.`; reload the versions; retarget and draw. `ApiError`: `#spMsg` = `errorText`, edits kept. Finally `saving = false`; `paintSave()` |
| **Discard** | `panel.set(base)`; empty `#spMsg`; `paintSave()` |
| **Restore** | `confirm('Make the version of <clock.stamp(saved_at)> current? Unsaved changes are lost.')`; cancel → nothing. `saving = true`; `paintSave()`; `{ settings, warnings } = await restoreSettings(id, v.id)`; `old = base`; `base = settings`; `panel.set(settings)`; `#spMsg` = one `li` per warning, then one `li` per `changeLines(diffSettings(old, settings))`; reload the versions; retarget and draw. `ApiError`: `#spMsg`. Finally `saving = false`; `paintSave()` |
| **Acknowledge** | Button disabled; `await ackAlarm(id, a.alarm_key)`; reload alarms. `ApiError`: `#lvMsg`, button enabled |
| **Older** | Button disabled; `page = await getEvents(id, { limit: 100, before: <smallest id in events> })`; merge each; render; an empty page hides `#lvOlder`, else enable it |
| **Save details** | `changes = detailChanges(room, { name: #rdName.value, volume: #rdVolume.value })`; `{}` → `#rdMsg` = `Nothing to change.`; else `room = await updateRoom(id, changes)`; repaint; `#rdMsg` = `Saved.` `ApiError`: `#rdMsg` (`errorText`) |
| **Archive room** | `confirm('Archive "<room.name>"? Its loop stops and it leaves the Rooms list. Its data is kept.')`; OK → `await updateRoom(id, { archived: true })` (never with other fields); `location.hash = '#/rooms'`. `ApiError`: `#rdMsg` |
| `unmount` | Each step in its own `try { … } catch (e) { console.error(e); }`: `alive = false` (every pending `await` checks it); call every `off()`; `panel.destroy()`, `charts.destroy()`, `ladder.destroy()` (those created); close an open `showChanges` dialog (`document.querySelector('body > dialog[open]')`; its result is ignored). Unsaved edits are dropped without a prompt (C5 7.9) |

### 5.5 Texts (exact)

| Where | Text |
|---|---|
| Air card | Heading `Air exchange`; the `airLive` and `airSub` texts of 5.2 |
| Values | `Temperature`, `Humidity`, `CO₂`, `Reading at <stamp>`, `No reading yet`, `Targets now: <T> °C · <RH> % RH · CO₂ limit <CO2> ppm` |
| Settings | `<n> unsaved change(s)`, `Save these changes to <room>?`, `Saved.`, `The settings changed on the server; your <n> change(s) are kept.`, `Make the version of <saved_at> current? Unsaved changes are lost.` |
| Details | `Nothing to change.`, `Saved.`, `A new volume restarts the room's loop.`, `Archive "<room>"? Its loop stops and it leaves the Rooms list. Its data is kept.` |
| Lists | `No alarms.`, `Acknowledge`, `Older`, `Settings versions`, `Restore` |

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, then implement, see it pass, `npm test`, commit)

### 6.1 Test file header

```js
// web/room-live.js helpers (docs/contracts/web.md 3.4, 7.9; C9 7).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js'); require('../web/settings-panel.js');
require('../web/room-tabs.js');
require('../web/room-live.js');
const H = globalThis.FarmRoomTabs.get('live').helpers;
const CC = globalThis.ClimateController, clock = globalThis.FarmUi.farmClock();
const S = CC.defaultSettings();                                   // airM3h 1800, rules.purgeMaxS 180
const AIR = { on: false, state: 'idle', reason: null, delayed: false, timed: false, manual: false, manualOn: false,
  nextPurgeS: null, purgeS: null, why: null, today: { purges: 0, avgS: null, capped: 0 } };
const air = over => ({ ...AIR, ...over });
const READING = { room_id: 1, t: 1791450000, T: 18.2, RH: 88.4, CO2: 812, t_out: 31.5, rh_out: 62, ac_mode: 'cool', ac_setpoint: 17.5,
  fog: 1, air: 0, lights: 1, circ: 0, power_w: 1430, kwh: 12.84, ac_fan: 'auto', stage: 'fruiting', core: 19.1 };
const TG = { spT: 18, spRH: 88, co2Lim: 1000, fanOn: 900, fanOff: 700 };
```

`1791450000` is `2026-10-08 17:00:00` farm time. `defaultSettings()`: `spT` 25, `spRH` 88, `co2Lim` 1000, `rules.fanOn` 900, `rules.fanOff` 700, `rules.purgeMaxS` 180, `airM3h` 1800, crop `oyster` (`Grey oyster`), stage `fruiting` (`Fruiting`).

### 6.2 Tasks

| # | Test(s) first | Then build | What it proves |
|---|---|---|---|
| 0 | – | Section 2 checks; read the files listed there. No commit | The start state |
| 1 | **LV1 registration**: `FarmRoomTabs.get('live')` has `mount`, `unmount` functions and a `helpers` object with every name of 5.2; loading did no DOM work; `unmount()` before any mount does not throw | Skeleton: wrapper, `FarmRoomTabs.register('live', { mount, unmount, helpers })` | C5 1.4, 3.9 |
| 2 | **LV2 airLive, every row** (C5 3.4): row 1 `air({ on: true, state: 'purge', reason: 'purge', purgeS: 75 })` with `S` → `{ state: 'Purge 1:15 of 3:00', glance: 'Purging 1:15', chip: { lvl: 'info', icon: '▲', text: 'Purging' } }` (and with `settings` `null`: `state` `Purge 1:15`); row 2 `reason: 'safety'` → both `Safety run`, chip `{ lvl: 'serious', icon: '◆', text: 'Safety run' }`; row 3 `timed`, `free cooling`, `drying`, `manual` → `Timed purge`, `Free cooling`, `Drying`, `Manual on`, chip `{ lvl: 'info', icon: '●', text: <the same> }`; row 4 `air({ manual: true, manualOn: true })` → both `Manual on`, chip `{ lvl: 'info', icon: '●', text: 'Manual on' }`; row 5 `air({ manual: true })` → both `Manual off`, chip `{ lvl: 'none', icon: '○', text: 'Manual off' }`, also with `delayed: true` (row 5 wins); row 6 `air({ delayed: true })` → both `Delayed (humidity first)`, chip `{ lvl: 'info', icon: '❚❚', text: 'Delayed' }`; row 7 `air({ timed: true })` → both `Timed purge · off`, chip `{ lvl: 'none', icon: '○', text: 'Idle' }`; row 8 `nextPurgeS` 240 → `state` `Idle · purge in about 4 min`, `glance` `Next purge in about 4 min`, chip Idle; 241 → `5 min`; 30 → `1 min`; row 9 `AIR` and `air({ state: 'after' })` → both `Idle`, chip Idle; an `on` row beats `manual` (`air({ on: true, reason: 'manual', manual: true, manualOn: true })` → row 3 `Manual on`). **LV3 day line**: `AIR` → `Purges 0 · average –`; `today: { purges: 41, avgS: 74, capped: 0 }` → `Purges 41 · average 1:14`; `avgS: 74.4` → `1:14`; `capped: 2` → `Purges 41 · average 1:14 · 2 capped`. **LV4 null**: `airLive(null, S)` deep-equals `{ state: '–', glance: '–', chip: null, day: '' }`. **LV5 airSub**: `airSub(S)` = `SF-203 + EF-206 · 1,800 m³/h`; `airSub(null)` = `SF-203 + EF-206` | `airLive`, `airSub` | C5 3.4 tables, C9 7, lead decision 27 |
| 3 | **LV6 windows**: `windowQuery(3600, 10000)` → `{ from: 6400, to: 10000, step: undefined }`; 21600 no step; 86400 → 120; 604800 → 900; 7200 throws `RangeError`. `gapFor(undefined)` 90, `(120)` 360, `(900)` 2700. `reconnectQuery(3600, 9000, 10000)` → `{ from: 9001, to: 10000, step: undefined, merge: true }`; `(3600, 1000, 10000)` → `from` 6400; `(3600, 10000, 10000)` → `null`; `(3600, null, 10000)` → the whole window, `merge: false`; `(86400, 9000, 10000)` → `{ from: -76400, to: 10000, step: 120, merge: false }` | `windowQuery`, `gapFor`, `reconnectQuery` | C5 3.4, C4 10.4 |
| 4 | **LV7 points**: `chartTargets({ targets: { T: 18, RH: 88, CO2: 1000 } }, S)` → `TG`; `targets: null` → `spT` 25; `(null, null)` → all `NaN`. `toChartPoint(READING, TG)` deep-equals `{ t: 1791450000, T: 18.2, RH: 88.4, C: 812, tOut: 31.5, rhOut: 62, core: 19.1, spT: 18, spRH: 88, co2Lim: 1000, fanOn: 900, fanOff: 700 }`; `{ ...READING, T: null, CO2: 20000, rh_out: -5, core: null }` → `T`, `C`, `rhOut`, `core` `NaN`, the rest unchanged. `retarget` gives every point `TG`, input unchanged. `mergePoints([{t:10},{t:40}], {t:25}, 0)` → 10, 25, 40; `+ {t:40, T:1}` → length 2, last `T` 1; `from` 20 drops 10; `{t:5}` with `from` 20 not added; input unchanged | `chartTargets`, `toChartPoint`, `retarget`, `mergePoints` | C5 3.4 Reading → ChartPoint |
| 5 | **LV8 texts**: `readingTexts(READING, clock)` → `{ T: '18.2 °C', RH: '88 % RH', CO2: '812 ppm', at: 'Reading at 2026-10-08 17:00:00' }`; `null` → `—` ×3 and `No reading yet`. `machineLines(READING)` → `['AC Cool 17.5 °C', 'Fogger level 1', 'Air exchange Off', 'Lights on', 'Circulation fan off', 'Power 1.43 kW']`; `{ ...READING, ac_mode: 'off', ac_setpoint: null, fog: 0, air: 1, lights: 0, circ: 1, power_w: null }` → `['AC off', 'Fogger off', 'Air exchange On', 'Lights off', 'Circulation fan on']`; `null` → `[]`. `programText({ crop: 'oyster', stage: 'fruiting', flush: 2 })` → `Running now: Grey oyster · Fruiting · flush 2`; `flush: null` → no flush part; `null` and `{ crop: null }` → `''` | `readingTexts`, `machineLines`, `programText` | C5 3.4, 7.9 slots |
| 6 | **LV9 command**: `commandFromReading(READING)` deep-equals `{ ac: { power: true, mode: 'cool', setpoint: 17.5 }, hu: { level: 1 }, air: { on: false }, lights: { on: true }, circ: { on: false } }`; `air: 1` → `air: { on: true }`; AC off → `ac` deep-equals `{ power: false }`; `null` → `null`. **LV10 lists**: `alarmTexts` of C3 3.4's example → `main` `High humidity · since 2026-10-08 17:00:12`, `state` `Active · not acknowledged`, `canAck` true; `cleared_at: 1791450600, acked_at: 1791450700` → `Cleared 2026-10-08 17:10:00 · acknowledged`, `canAck` false. `mergeEvent([{id:5},{id:3}], {id:6})` → 6, 5, 3; `+ {id:5}` unchanged; `+ {id:4}` → 5, 4, 3. **LV11 forms**: `detailChanges({ name: 'Room 1', volume: 60 }, { name: ' Room 1 ', volume: '60' })` → `{}`; `{ name: 'Shed A', volume: '80' }` → `{ name: 'Shed A', volume: 80 }`. `countText(0)` `''`, `(1)` `1 unsaved change(s)`. `versionText({ id: 14, saved_at: 1791450100, note: 'Lower RH' }, clock, true)` → `2026-10-08 17:01:40 · Lower RH · current`; `note: null`, not current → `2026-10-08 17:01:40 · —`. `changeLines(diffSettings(S, { ...S, spT: 20 }))` → `['Temperature target: 25 °C → 20 °C']` | `commandFromReading`, `alarmTexts`, `mergeEvent`, `detailChanges`, `countText`, `versionText`, `changeLines` | C5 7.9 Command (C9 7), 3.4 |
| 7 | **LV12 rebase**: `from` `S`, `edited` `spT` 20, `to` `spRH` 90 → `spT` 20 and `spRH` 90, `kept` 1; `edited` equal to `from` → `settings` deep-equals `to`, `kept` 0; the user's edit wins on the same setting (`edited` `spT` 20, `to` `spT` 22 → 20); the arguments deep-equal their copies afterwards | `rebase` | C5 7.9 |
| 8 | No Node test (DOM) | Markup 5.3; mount, listeners, loads, charts, values, air card, glance row (5.4 to row `down`) | Task 10 |
| 9 | No Node test (DOM) | Panel, slots, ladder chip, `paintSave`, **Save**, **Discard**, **Restore**, alarms, events, details, `unmount` (5.4) | Task 10 |
| 10 | Headless Chrome (7.2), after gate 2.5 | Fix what it finds; a Node test first for any helper bug | C5 7.10 row "Live tab" |
| 11 | – | Section 7.1; commit; report (section 10) | – |

| Point | Rule |
|---|---|
| Test names | Start each test with its id (`test('LV2 airLive follows the C5 3.4 rows', …)`). One `test(…)` per id: LV1–LV12 |
| Exact texts | Every text of 5.2 and 5.5 word for word |

## 7. How to verify

### 7.1 Commands (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check web/room-live.js` | No output, exit 0 |
| `node --disable-warning=ExperimentalWarning --test tests/web-room-live.test.js` | `# fail 0`; LV1–LV12 listed |
| `npm test` | `# fail 0`; `# pass` = `N0` + 12; `# skipped` = `K0` |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `tests/web-room-live.test.js` and `web/room-live.js` |
| `grep -n "setTimeout\|setInterval\|FarmApi.stream\|listRooms" web/room-live.js` | No output (no timer, no stream, no `listRooms()`: the frame's) |
| `grep -n "drawPurgeBars\|applySettings\|document.body" web/room-live.js` | No output (the open dialog is found with `document.querySelector('body > dialog[open]')`, which this pattern does not match) |
| `node -e "require('./web/room-tabs.js');require('./web/room-live.js')"` | No output, exit 0 |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git status --short` | Empty |

### 7.2 Headless Chrome, after gate 2.5 (C5 3.9 "Headless checks of one tab", 7.10 row "Live tab")

Run only when the lead says gate 2.5 passed. Drive Chrome with the chrome-devtools MCP tools or with `cdp.js` of `web-split.md` Appendix A, copied into a scratch folder made with `mktemp -d`. The check tree's `index.html` (the lead's prep 2.0 file) already loads every script: inject none. The tree has the wave 0 `web/rooms.js` stub and the wave 1 `web/shell.js`, so `#/rooms` shows `This part of the app is not installed.`; the check empties `#view` and mounts the tab by hand. The Room shell CSS block is absent: make no layout assertion.

| Step | Shell |
|---|---|
| Check tree | `T=$(mktemp -d); git -C <worktree> archive master \| tar -x -C $T; MB=$(git -C <worktree> merge-base HEAD master); git -C <worktree> archive HEAD -- $(git -C <worktree> diff --name-only $MB HEAD) \| tar -x -C $T` |
| Server (background) | `PORT=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"); cd $T && FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$T/check.db npm start`; open `http://127.0.0.1:<PORT>/` and wait until `(await FarmApi.listRooms())[0].live.reading` is set (up to 35 s) |

The harness (one `evaluate_script`; it stands in for the frame, C5 7.10 and wave 2 plan finding 27):

```js
(async () => {
  let R = (await FarmApi.listRooms()).find(r => r.id === 1);
  const L = {};
  const ctx = { id: 1, params: {}, room: () => R,
    on: (type, fn) => { (L[type] ||= []).push(fn); return () => { L[type] = L[type].filter(f => f !== fn); }; } };
  const view = document.getElementById('view');
  view.replaceChildren();
  await FarmRoomTabs.get('live').mount(view, ctx);
  const close = FarmApi.stream(async (type, data) => {
    if (['reading', 'event', 'alarm', 'settings'].includes(type) && data.room_id === 1) (L[type] || []).forEach(f => f(data));
    if (type === 'reading' && data.room_id === 1) {
      R = (await FarmApi.listRooms()).find(r => r.id === 1);
      (L.room || []).forEach(f => f(R));
    }
  });
  window.__live = { ctx, L, close, get R() { return R; }, H: FarmRoomTabs.get('live').helpers };
  return true;
})()
```

| # | Step | Expected |
|---|---|---|
| L1 | After the harness | `#lvT .val`, `#lvRH .val`, `#lvCO2 .val` are numbers with units; `#lvAt` starts `Reading at `; `#lvMachines` has a line `Air exchange On` or `Air exchange Off` that matches `__live.R.live.reading.air` |
| L2 | Air exchange | `#airSub` = `SF-203 + EF-206 · 1,800 m³/h`; `#airState` = `__live.H.airLive(__live.R.live.air, await FarmApi.getSettings(1)).state`; `#airGlance` and `#airDay` the same helper's `glance` and `day`; `#airWhy` = `__live.R.live.air.why ?? ''`; the ladder in `[data-slot="rules-side"]` shows the helper's `chip.text` |
| L3 | Wait up to 35 s for the next reading | `#lvAt` changes; a point is added to the charts (no reload); the air texts follow the new `R` |
| L4 | Charts, alarms, events | Three `svg.chart` in `#lvCharts`; `#lvAlarmList` has rows or `No alarms.`; `#lvLog` has `Room created` and `Started` rows, newest first, farm-time stamps |
| L5 | Click `24 h` in `#lvWinSeg` | A request `GET /api/rooms/1/readings?from=…&to=…&step=120`; the button pressed |
| L6 | Note the `#lvT` chip text. `S = await FarmApi.getSettings(1); await FarmApi.saveSettings(1, { ...S, spT: 12 }, 'headless status')`; wait up to 65 s | The `#lvT` chip text changes without a reload (the next reading, then the harness's `listRooms()` row passed as `room`); `#lvTargets` shows `12.0 °C` (or the ramped value on its way to 12) |
| L7 | `program-status` slot | `[data-slot="program-status"]` text contains `flush ` followed by a number (`__live.R.live.flush`) |
| L8 | Click `Installer` in `#levelSeg`; set `#inSpT` to 20 (`value = 20`, dispatch `input`) | `#spCount` = `1 unsaved change(s)`; **Save** and **Discard** enabled |
| L9 | Click **Save**; the dialog lists a `Temperature target: … → 20 °C` line; type `headless check`; confirm | `#spMsg` = `Saved.` (or the warnings); the top `#lvVersions` row ends `headless check · current`; `(await FarmApi.getSettings(1)).spT === 20`; `#spCount` empty |
| L10 | Change `#inSpRH` (unsaved); `await FarmApi.saveSettings(1, { ...(await FarmApi.getSettings(1)), co2Lim: 1200 }, 'from outside')` | `#spMsg` = `The settings changed on the server; your 1 change(s) are kept.`; `#spCount` still `1 unsaved change(s)`; the panel shows `co2Lim` 1200; the versions reloaded |
| L11 | Click **Discard** | The panel shows the server's settings; `#spCount` empty; **Save** and **Discard** disabled |
| L12 | **Restore** on the row with note `Created`; accept the `confirm` | `#spMsg` lists `Temperature target: 20 °C → 25 °C` and the other restored changes; the top note is `Restored version <id>`; `getSettings(1)` equals the restored values |
| L13 | `#rdName` `Room 1b`, **Save details**; then **Save details** again | `#rdMsg` `Saved.`; then `Nothing to change.`; `(await FarmApi.listRooms())[0].name === 'Room 1b'` |
| L14 | `FarmRoomTabs.get('live').unmount()`; wait 35 s | No console error; no new DOM work in `#view` from a late reply; no `dialog` left |
| L15 | The console for the whole session | No errors; no 404 except `/favicon.ico` |
| End | `__live.close()`; stop the server; `rm -rf $T` and the scratch folder | – |

## 8. Done when

| # | Item |
|---|---|
| 1 | Every start check of section 2 held (or the lead answered) |
| 2 | `web/room-live.js` replaces the stub, registers tab `live` with `mount`, `unmount`, `helpers`, defines no global, does no DOM work at load |
| 3 | Every helper of 5.2 behaves as its row says and is tested (LV1–LV12); `airLive` gives every row of the C5 3.4 table and `airLive(null)` |
| 4 | The tab uses exactly the ids, texts and behaviour of 5.3–5.5; data only through `FarmApi` and `ctx`; no stream, no timer, no `listRooms()`; no `drawPurgeBars` |
| 5 | Settings follow C5 7.9 (Save with change list and note, Discard, `saving`, stream `settings` rebase, reconnect rebase, Restore) |
| 6 | `npm test` `# fail 0` at `N0` + 12, `# skipped` `K0`; only the two owned files differ from the merge base |
| 7 | Every headless row L1–L15 passed after gate 2.5, with no console error |
| 8 | Committed on `stream/room-live` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 3, or add CSS | File owners; lead decision 32 (the Room shell's block has your classes) |
| Open `FarmApi.stream`, call `listRooms()`, or add a timer | C5 3.4, 3.8, 3.9: the frame owns the stream and the refresh |
| Draw the hourly purge bars (`drawPurgeBars`) on the Live tab | C5 3.4 row "Air exchange per hour": they stay in the Test bench in wave 2 |
| Read the air exchange from a controller in the page, or call `airText` of `web/simulator.js` | The Live tab reads `live.air` (C5 3.4); `web/simulator.js` is the Bench stream's |
| Compute targets, status chips or alarms in the browser, or call `ClimateController.applySettings` | The server runs the controller; lead decision 6 |
| Show a fan level for the air exchange | C5 3.4: `On` or `Off` from `r.air` |
| Send `archived: true` with other fields, or unchanged fields in a `PATCH`; send `vent` | C5 4.3, C9 6.3 |
| Restore through `saveSettings` | C3 6.7 |
| Prompt before leaving with unsaved edits | C5 7.9 |
| Put dynamic text into `innerHTML`; touch `document.body` attributes or the frame's elements | C5 1.4, 3.1 |
| Push, merge, rebase, merge `master` into your branch, or change git config | The lead merges after review |

## 10. Report to the lead

| Item | Content |
|---|---|
| Result | Done or blocked; `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | `N0`, `K0`, the final `npm test` counts |
| Headless | One line per row L1–L15: pass or fail, with what you saw |
| Points to confirm | (1) the helpers beyond `airLive` (5.2); (2) the ids `lv*` and `rd*`, `sp*`; (3) `airLive` row 3 with an unknown or `null` reason (`On`) and row 1 without settings; (4) the room details card on the Live tab (C5 3.3 "Room-centred moves") |
| Anything else | Every contract gap or mismatch you met, and what you did instead of guessing |

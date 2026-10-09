# Work brief: Room shell (`web/shell.js`, `web/rooms.js`, the `/* Room page */` CSS block)

Revision 1, 2026-10-09 (wave 2, written in prep 2.0 from the frozen contracts on `master` e60dabf). Stream: **Room shell**. Implementer on Sonnet; the reviews (spec compliance, then code quality) run on Opus before the lead merges.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–69 (here: 2, 4, 5, 6, 14, 15, 16, 25, 27, 29, 32, 60, 65, 66) | `docs/contracts/LEAD-DECISIONS.md` | They override this brief and every contract text |
| C5 revision 8 (web modules) | `docs/contracts/web.md` | 1.2, 1.3, 1.4, 1.7, 2.1–2.4, 3.1, 3.2, 3.7 (the import table), 3.8, 3.9 (the tab context the frame builds), 4.1–4.5, 5, 7.10 row "Room shell" |
| C3 and C4 revision 9 (HTTP API, live feed) | `docs/contracts/api.md` | 3.1 Room and Live (with `flush`, `blocks`, `air`), 3.2 Reading, 6.1, 6.2, 6.3, 6.13, 6.14, 6.16, 6.19, 7.2–7.4, 8, 8.1 (the import requests), 10 (stream) |
| C10 revision 2 (batches and harvest) | `docs/contracts/harvest.md` | Section 11 (the four routes, two module names, menu marking, the bare layout); section 14 rows C5 2.1–2.3 |
| C2 revision 9 (room manager) | `docs/contracts/rooms.md` | 5.2 Live (read-only background: when `room` events come, section 7) |
| Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Sections 3 (Room shell row), 3.1, 4, 5, 6 |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/room-shell.md` | Committed on `master` by the lead in prep 2.0; you do not edit it |

## 1. Goal

| Outcome | Measure |
|---|---|
| The shell knows the room-centred and harvest addresses | `FarmShell.parseHash` gives every route of C5 2.1 (the four C10 routes included); `#/rooms/:id` replaces to `/live`; `#/capacity`, `#/calibration` and unknown hashes go to `#/rooms`; a module's `update(params)` keeps it mounted (C5 2.3 step 2); the menu marks the right link; `body[data-layout="bare"]` is set on `#/harvest/:id` only (lead decision 66) |
| The Rooms home | One card per room with the status chip by precedence (**Stopped > alarms > Out of band > All good**), crop and stage by name, flush and blocks, the air line, T / RH / CO₂ now; **New room**; the one-time **Import rooms from this browser**; live through one stream and the `listRooms()` refresh |
| The room page frame | Header, the tabs **Live · Simulate · Calibrate**, one stream per room page, the status refresh, **Restart**; each tab mounted with its `ctx` (C5 3.9); a tab switch keeps the header (no remount, no new `GET /api/rooms`) |
| The room page styles | One appended `/* Room page */` block in `styles.css` with every class of C5 3.8 (`.room-air` and `.cal-charts` included); no other stream edits `styles.css` (lead decision 32) |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/room-shell` (below `<worktree>`), on branch `stream/room-shell`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm` (another developer's working tree). |
| Git | Keep the configured identity (never change `git config`). Plain commit messages such as `feat(shell): …`, `feat(rooms): …`, `test(rooms): …`, `style(rooms): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase; never merge `master` into your branch (wave 2 plan 4). |
| Gate 2.5 | Your headless checks need the real server with the wave 2 routes: they run only after the lead's gate 2.5 (wave 2 plan 5). Do tasks 0–8 first, commit, tell the lead you wait for gate 2.5, then run task 9 when the lead says it passed. |

| Check (from `<worktree>`) | Expected; otherwise stop and report to the lead (never write a stand-in) |
|---|---|
| `git branch --show-current` | `stream/room-shell` |
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` (C5 1.6) | All three listed |
| `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js web/batches.js web/harvest.js web/harvest.css` (C5 1.7) | All eight listed |
| `grep -c 'web/room-tabs.js' index.html` (C5 1.7) | `1` |
| `grep -c '#/batches' index.html` | `1` (the lead's prep 2.0 `index.html`, C5 1.2) |
| `cat web/rooms.js` | Exactly the C5 1.5 stub: `(function (global) { 'use strict'; })(typeof window !== 'undefined' ? window : globalThis);` |
| `grep -n -e listSimulations -e getEquipment -e restartRoom web/api.js` | All three present (lead, prep 2.0, C5 4.3) |
| `npm test` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `K0` (the prep 2.0 skips of wave 2 plan step 2b; none is in your files) |

Read before you code: `web/shell.js` and `tests/web-shell.test.js` (wave 1; you rewrite both), `web/api.js`, `web/ui.js` (`paintChip`, `ICON`, `fmtNum`, `watts`, `errorText`, `farmClock`), `web/room-tabs.js` (`FarmRoomTabs`), `room-rules.js` (`normRoom`), `tests/fakes/api-server.js`, `tests/web-load.test.js` (it loads `web/shell.js` and must stay green), the end of `styles.css`.

## 3. Owned files (the only files you may touch; wave 2 plan 3, Room shell row)

| File | Action | Content |
|---|---|---|
| `web/shell.js` | Modify | C5 2.1–2.4 with C10 11: `parseHash` and `MENU_NAMES` as members, the redirect of `#/rooms/:id`, the `update(params)` step, menu marking per route, the bare layout |
| `web/rooms.js` | Replace the stub | C5 3.8: Rooms home and room page frame; registers `rooms` |
| `styles.css` | Append one block | `/* Room page */` at the very end (5.6); no existing rule changed or moved |
| `tests/web-shell.test.js` | Rewrite | Section 6 (the wave 1 file tests `#/capacity` and `#/rooms/3` as routes; both change) |
| `tests/web-rooms.test.js` | Create | Section 6 |

| Not yours | Owner |
|---|---|
| `index.html` (already has every wave 2 script tag and the menu **Rooms · Batches · Test bench**) | Lead (prep 2.0), then nobody |
| `web/room-tabs.js`, `web/api.js`, `tests/fakes/*`, `tests/web-api.test.js`, `room-rules.js` stub history | Lead (prep 2.0) / Server 2 (`room-rules.js`) |
| `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js` | Live tab, Simulate tab, Calibrate tab streams |
| `web/room-equipment.js` | Equipment |
| `web/batches.js`, `web/harvest.js`, `web/harvest.css` (the bare layout's `.bar` rule is there) | Harvest web |
| `web/simulator.js`, `calib.js` | Bench |
| `web/capacity.js`, `web/calibration.js`, `tests/web-load.test.js`, `tests/web-bench.test.js`, `tests/web-air.test.js`, `tests/web-mimic.test.js` | Nobody in wave 2 (the lead in wave 3) |
| Everything else (`server/*`, shared modules, `docs/*`, `package.json`, vectors) | Read-only |

| Rule | Detail |
|---|---|
| Blocked | If something outside your files blocks you, stop that part and report it to the lead. A contract gap is reported, never worked around. |
| Scratch | Check scripts and check trees live in `mktemp -d` folders outside the repo; never commit them. |

## 4. What you build against

| Source | What you take from it |
|---|---|
| C5 1.4 | IIFE wrapper, no DOM at load, at most the one global (`FarmShell`; `web/rooms.js` defines none), markup as a template string set once per mount with `innerHTML`, every dynamic text with `textContent` |
| C5 2.1 | The route table and its rules (ids `^[1-9][0-9]{0,14}$`, `#/harvest/stickers` before `#/harvest/:id`, trailing `/` ignored, no query strings), `parseHash` as a member |
| C5 2.2 | `register`, `MENU_NAMES` (frozen: `{ rooms: 'Rooms', simulator: 'Test bench', batches: 'Batches', harvest: 'Harvest' }`), `level` |
| C5 2.3 | The 7 switching steps, with step 2 (`update(params)`) and step 5 (menu marking per route, `document.title`, the bare layout) |
| C5 3.1, 3.2 | Module object (`mount`, `unmount`, `update?`), DOM scope (modules never touch `document.body`; `data-layout` is the shell's), the `rooms` module row |
| C5 3.4 row "Status chips and targets" | The required `listRooms()` refresh after a `reading` event, at most once per 30 s per page, one timer cleared by `unmount` |
| C5 3.7 import table, C3 8.1 | **Import rooms from this browser**: stored data, marker, button, confirm, requests (calibration with `source: 'import'`), messages, no rollback |
| C5 3.8 | Every part of the home and the frame, the texts, the classes of the CSS block, the helpers `cardTexts`, `infoText`, `statusChip`, `readStored`, `importPlan`, `importRooms` |
| C5 3.9 | `FarmRoomTabs.get`, `NAMES`; the tab member contract; the `ctx` the frame builds (`id`, `params`, `room()`, `on(type, fn)`) |
| C5 4.3–4.5 | `listRooms`, `createRoom`, `restartRoom`, `saveMix`, `saveCalibration`, `applyCalibration`, `stream`; `ApiError`; `startFakeApi({ root })` for the Restart check |
| C5 7.10 row "Room shell" | Your Node tests and your headless check |
| C10 11 | The four harvest routes, module names `batches`, `harvest`, menu marking, bare layout |

| Lead decision | As it applies to this stream |
|---|---|
| 2 | `room` events come only from C2 and only on a summary change (`stage`, `crop`, `alarms`, `running`, `error`); `live.status`, `live.targets`, `live.air`, `live.flush`, `live.blocks` reach the page through the `listRooms()` refresh |
| 4 | The 45 s watchdog is `FarmApi.stream`'s; you only react to `open` / `down` |
| 5 | **Restart** calls `FarmApi.restartRoom(id)` |
| 14, 15, 16 | Room-centred app; the routes and the `update(params)` rule; `web/rooms.js` owns the home and the frame, each tab is its own file |
| 27 | `live.flush`, `live.blocks` on the card and the header; `live.air` is the Live tab's (you pass the Room through) |
| 32, 65 | Only you change `styles.css`, with one appended block; the harvest classes and the `.bar` rule are in `web/harvest.css` (not yours) |
| 66 | The shell sets `body[data-layout="bare"]` on `#/harvest/:id` and removes it on every other route |

## 5. Design (fixed by this brief where the contracts leave it open)

### 5.1 `web/shell.js`

| Item | Rule |
|---|---|
| `parseHash(hash)` | Pure. Returns `{ name, params }` (params of C5 2.1), `{ redirect: '#/rooms/<id>/live' }` for `#/rooms/:id`, or `null`. The hash must start with `#/`; one trailing `/` is dropped; then split on `/`; an empty segment (`#//simulator`, `#/rooms//3`) or any other shape is `null`. `#/capacity`, `#/calibration` and every unknown name are `null`. `#/harvest/stickers` is checked before `#/harvest/:id`. Ids match `^[1-9][0-9]{0,14}$` and are converted with `Number`. |
| Tabs in `parseHash` | `tab` must be one of `live`, `simulate`, `calibrate` (the names of C5 3.9; `parseHash` does not read `FarmRoomTabs`, so `web/shell.js` still loads alone in Node). `:runId` only after `calibrate`. |
| `MENU_NAMES` | `Object.freeze({ rooms: 'Rooms', simulator: 'Test bench', batches: 'Batches', harvest: 'Harvest' })` |
| `FarmShell` members | Exactly `register`, `MENU_NAMES`, `parseHash`, `level` (C5 2.1, 2.2). `tests/web-load.test.js` must stay green (no new global, nothing at load). |
| `register(name, module)` | Stores the module under any name (a second call replaces); it does not throw for other names (`tests/web-load.test.js` replaces it with a recorder anyway) |
| Menu link of a route | `rooms` → `rooms`; `simulator` → `simulator`; `batches` → `batches`; `harvest` with `view: 'stickers'` → `batches`; `harvest` with `view: 'record'` → none. Step 5 sets `aria-current="page"` on the `#menu a` whose `data-module` is that value and removes it from every other link |
| Step 1 | `null`: `location.replace('#/rooms')`, stop. `{ redirect }`: `location.replace(redirect)`, stop (the `hashchange` of the replace routes again). |
| Step 2 | Same module and equal params (same keys, `===` values): nothing. Same module, other params, the module has `update` and `update(params) === true`: store the params, then step 5 only (menu, title, layout), stop. An `update` that throws is logged with `console.error` and counts as `false`. |
| Step 5 layout | `parsed.name === 'harvest' && parsed.params.view === 'record'` → `document.body.dataset.layout = 'bare'`; else `delete document.body.dataset.layout` |
| Title | `` `${MENU_NAMES[name]} · Mushroom farm` `` (the harvest pages: `Harvest · Mushroom farm`) |
| Unchanged | Level and theme (C5 2.4), the wave 1 rule that a late rejection of an old mount never touches the new view, the notices `This part of the app is not installed.` and `This page could not be opened: <message>` |

### 5.2 `web/rooms.js`: module shape and pure helpers

| Item | Rule |
|---|---|
| Registration | At load, exactly one call: `global.FarmShell.register('rooms', { mount, unmount, update, helpers })`. `helpers` holds the pure functions below for `tests/web-rooms.test.js`; the shell ignores it (C5 3.1 lists no `helpers` member; reported as a contract point, section 10) |
| At load | No DOM, no `FarmApi` call, no timer. `ClimateController`, `ClimateSim`, `ClimateRoomRules`, `FarmUi`, `FarmApi`, `FarmRoomTabs` are read inside functions |
| `mount(el, params)` | No `params.id`: the home (5.3). With `params.id`: the frame (5.4) |
| `update(params)` | Frame mounted and `params.id === id`: the tab switch of 5.4, return `true`. Anything else (home mounted, another id, home requested): return `false` |
| Clock | `FarmUi.farmClock()` for every time shown |

`CC` = `ClimateController`. Names: `cropName(k)` = `CC.CROPS[k] ? CC.CROPS[k].name : k`; `stageName(k)` = `CC.STAGES[k] ?? k`. No helper changes its arguments.

| Helper | Signature → result | Rule |
|---|---|---|
| `statusChip(room)` | `(Room) → Chip` | C5 3.8 precedence, first that applies: `!live \|\| live.running === false` → `{ lvl: 'serious', icon: '▲', text: 'Stopped' }`; `live.alarms > 0` → `{ lvl: 'warning', icon: '▲', text: '<n> alarm' }` for 1, `'<n> alarms'` otherwise; any of `live.status.T`, `.RH`, `.CO2` with `lvl !== 'good'` (`live.status` not `null`) → `{ lvl: 'info', icon: '•', text: 'Out of band' }`; else `{ lvl: 'good', icon: '✓', text: 'All good' }`. Icons are `FarmUi.ICON[lvl]` (C5 3.8 gives none; `paintChip` needs one) |
| `cropText(live)` | `(Live \| null) → string` | `live` or `live.crop` `null`: `–`. Else `cropName(crop)`, plus ` · ` + `stageName(stage)` when `stage` is set |
| `cardTexts(room)` | `(Room) → { name, crop, air, T, RH, CO2, machines, stopped }` | `name` = `room.name`; `crop` = `cropText(live)` + ` · flush <flush>` when `live.flush` is set + ` · <blocks> blocks` when `live.blocks` is set (plain integer, C5 3.8); `air` = `–` without `live.reading`, else `Air exchange on` when `reading.air === 1`, else `Air exchange off`; `T` = `` `${fmtNum(r.T, 1)} °C` ``, `RH` = `` `${fmtNum(r.RH, 0)} % RH` ``, `CO2` = `` `${fmtNum(r.CO2, 0)} ppm` `` (`FarmUi.fmtNum`, so `—` without a reading); `machines` = `machineLines(reading).join(' · ')`; `stopped` = `null` while `live.running`, else `Stopped: <error>` or `Stopped` without an error |
| `machineLines(r)` | `(Reading \| null) → string[]` | `null` → `[]`. In order: `AC off` when `ac_mode === 'off'`, else `` `AC ${AC_WORD[ac_mode] ?? ac_mode} ${fmtNum(ac_setpoint, 1)} °C` `` with `AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' }`; `Fogger off` when `fog === 0`, else `Fogger level <fog>`; `Lights on` / `Lights off` (`lights === 1`); `Circulation fan on` / `Circulation fan off` (`circ === 1`); `` `Power ${FarmUi.watts(power_w)}` `` only when `power_w` is finite. The air exchange is the card's own air line, not here |
| `infoText(room)` | `(Room) → string` | `#rpInfo`: `cropText(live)`, then ` · flush <n>` when `live.flush` is set, then ` · <blocks> blocks` when `live.blocks` is set, then ` · <volume> m³` |
| `stateText(room)` | `(Room) → string` | `#rpState`: `Running` while `live.running`; else `Stopped: <live.error>`, or `Stopped` without an error or without `live` |
| `alarmsChip(n)` | `(int) → Chip` | `#rpAlarms`: `0` → `{ lvl: 'good', icon: '✓', text: 'No alarms' }`; else `{ lvl: 'warning', icon: '▲', text: '<n> alarm' \| '<n> alarms' }` |
| `upsertRoom(rooms, room)` | `(Room[], Room) → Room[]` | New array, `id` ascending. `room.archived_at !== null`: that id removed. Else the same id replaced, a new id inserted in order |
| `takeLive(rooms, reply)` | `(Room[], Room[]) → Room[]` | The home's refresh (C5 3.4: "takes `live.status` and `live.targets`"): same rooms and order; a room whose id is in `reply` (both `live` not `null`) becomes a copy with `live = { ...room.live, status: r.live.status, targets: r.live.targets }`; others are kept as the same objects; reply-only rooms are not added |
| `refreshRoom(room, row)` | `(Room, Room) → Room` | The frame's refresh (C5 3.8: the reply is passed to the tab as its Room, so `live.air`, `live.flush`, `live.blocks` follow too): a copy of `row` whose `live.reading` is the newer of `room.live.reading` and `row.live.reading` (larger `t`; `row`'s when both are `null` or equal); `row` with `live: null` is returned as it is |
| `refreshDelay(lastMs, nowMs)` | `(int \| null, int) → int` | `0` when `lastMs` is `null`, else `max(0, lastMs + 30000 − nowMs)` |
| `newRoomName(text, count)` | `(string, int) → string` | `text.trim()`, or `Room <count + 1>` when empty (C5 3.8) |
| `readStored(storage)` | `(Storage) → { i, room }[]` | C5 3.7 "Stored data": `JSON.parse(storage.getItem('mushroom-farm.rooms.v1'))`; for each element of its `rooms` array at index `i`, `room = ClimateRoomRules.normRoom(element, i)`, `null` results left out (`i` keeps gaps). Any throw, or no `rooms` array → `[]` |
| `importPlan({ i, room }, nowS)` | `→ { room, mix, calibration }` | Exactly the bodies of C3 8.1: `room` = `{ name: room.name.trim() \|\| 'Room <i + 1>', volume: room.volume }` (no air field); `mix` = `room.mix.map(m => ({ crop: m.crop, blocks: m.blocks, co2_per_block: m.co2PerBlock ?? null }))`; `calibration` = `null` when `room.calib` is `null`, else `{ ua, inf_ach, moist_buffer, co2_per_block, rmse_t, rmse_rh, rmse_co2, log_rows: null, source: 'import' }` with each `rmse_*` = the value when finite and ≥ 0, else `null`, plus `run_at` only when `Math.floor(Date.parse(calib.date) / 1000)` is an integer from 1 to `nowS + 60` |
| `importRooms(entries, api, { nowS, onRoom })` | `→ Promise<{ created, failed }>` | For entry `k` = 1…n in order, one request at a time: `onRoom(k, n)`; `p = importPlan(entry, nowS)`; `r = await api.createRoom(p.room)`; `created++`; `await api.saveMix(r.id, p.mix)`; when `p.calibration`: `run = await api.saveCalibration(r.id, p.calibration)`, `await api.applyCalibration(r.id, run.id)`. At the first rejection of any kind it stops and resolves `{ created, failed: { name: p.room.name, error } }`; else `{ created, failed: null }`. Never rejects |

### 5.3 The Rooms home (`#/rooms`)

Order in `el` (the 12-column grid of `main`):

| # | Element | Markup | Content |
|---|---|---|---|
| 1 | Explain | `p.explain` | The two C5 3.8 texts, exactly: `Every grow room is one card. The farm server runs each room's climate controller 24/7, so these values are live even when nobody has the page open.` and, in a second `p.explain`, `Live: is the room alright now? → Calibrate: make the virtual room match the real one → Simulate: will this crop plan work? → predicted vs real → Calibrate again` |
| 2 | Feed and message | `div.section-head`: `h2` `Rooms`, `span.tag#rhFeed` (`role="status"`); `p.tag.room-msg#rhMsg` (`role="status"`) | `#rhFeed` = `Live` after an `open`, `Reconnecting…` after a `down` |
| 3 | Cards | `div.contents#rhCards` | One `section.card.room-card[data-room-id="<id>"]` per room, `id` ascending (row "Card") |
| 4 | New room and import | `div.card.room-new` | `label` `Name` + `input#rhName` (text, `maxlength="60"`); `label` `Volume (m³)` + `input#rhVolume` (number, `min="5"`, `max="5000"`, `step="1"`, value `ClimateSim.PLANT.room.volume`); `button.btn#rhCreate` `New room`; `button.btn#rhImport` `Import rooms from this browser` (hidden unless C5 3.7 "Button" holds) |

| Card part | Content |
|---|---|
| Link | The whole card is an `a.room-link[href="#/rooms/<id>/live"]` wrapping the parts below except the **Restart** row (a `button` inside a link is invalid HTML, and the button must not follow the link) |
| Head | `h3` name; `span.chip` = `statusChip(room)` (`FarmUi.paintChip`) |
| Crop | `p.rc-crop` = `cardTexts(room).crop` |
| Air | `p.tag.rc-air` = `cardTexts(room).air` |
| Values | `div.rc-values[data-t]` (`data-t` = the reading's `t`, empty without one): three `div.rc-val[data-k="T" \| "RH" \| "CO2"]`, each `span.val` (text) and `span.chip` (`live.status[k]`, hidden while `live.status` is `null`) |
| Machines | `p.tag.rc-machines` = `cardTexts(room).machines` |
| Stopped | `div.rc-stopped`, hidden while `live.running`: `span` = `cardTexts(room).stopped`, `button.btn.rc-restart` `Restart` |

| Moment | Action |
|---|---|
| `mount` | Markup; `close = FarmApi.stream(onEvent)`; nothing loads before the first `open` (C4 10.3). Show `#rhImport` when C5 3.7 "Button" holds (`localStorage` read inside `try`; a throw = no stored data) |
| Each `open` | `#rhFeed` = `Live`; `rooms = await listRooms()`; render all cards. An `ApiError`: `errorText` in `#rhMsg`. Events that arrive before the reply are merged into the reply when it lands (`reading`: kept when newer by `t`; `room`: `upsertRoom`) |
| `down` | `#rhFeed` = `Reconnecting…` |
| `reading` | The room `data.room_id` (ignored when not listed): when its `live.reading` is `null` or `data.t >= live.reading.t`, `live.reading = data` and repaint that card's values, air line, machines and `data-t`. Then the refresh (row below) |
| `room` | `rooms = upsertRoom(rooms, data)`; render (an archived room disappears, a new id appears) |
| `event`, `alarm`, `settings` | Ignored |
| Refresh (C5 3.4, required) | After a `reading` of a listed room: when the timer is set or a call is in flight (then `queued = true`), nothing; else `timer = setTimeout(run, refreshDelay(last, Date.now()))`. `run`: `timer = null`, `last = Date.now()`, `reply = await listRooms()`; when still mounted: `rooms = takeLive(rooms, reply)`, repaint the status chips and the card chips. A failure changes nothing and is not retried. Finally, when `queued`: `queued = false` and schedule again. This timer is the module's only data timer |
| **Restart** (card) | Button disabled; `room = await restartRoom(id)`; `rooms = upsertRoom(rooms, room)`; render. `ApiError`: `errorText` in `#rhMsg`, button enabled |
| **New room** | `#rhCreate` disabled during the call; `room = await createRoom({ name: newRoomName(#rhName.value, rooms.length), volume: Number(#rhVolume.value) })` (no other field); `rooms = upsertRoom(rooms, room)`; render; empty `#rhName`; `#rhMsg` = `Created "<room.name>". It starts running at once (simulated, default settings).` `ApiError`: `errorText` in `#rhMsg` (for example `Invalid room: volume: …`). No client-side check besides the input attributes |
| **Import rooms from this browser** | C5 3.7 exactly: `confirm('Create <n> room(s) from this browser on the farm server? Each one starts running as a simulated room.')`; on OK `nowS = Math.floor(Date.now() / 1000)`, `importRooms(readStored(localStorage), FarmApi, { nowS, onRoom: (k, n) => #rhMsg = 'Importing room <k> of <n>…' })`; all buttons of the card disabled meanwhile. Complete: `localStorage['mushroom-farm.rooms.v1.imported'] = String(nowS)`, hide `#rhImport`, reload `listRooms()`, `Imported <n> room(s). Run the check again for each room.` Failure: no marker, reload `listRooms()`, `The import stopped at "<failed.name>": <errorText(failed.error)>. <created> room(s) were created; archive them on their room pages before you import again.` The stored data is never changed or removed |
| `unmount` | `alive = false` (every pending `await` checks it before touching the DOM); `close()` the stream; `clearTimeout(timer)` |

### 5.4 The room page frame (`#/rooms/:id/<tab>`)

| # | Element | Markup | Content |
|---|---|---|---|
| 1 | Header | `section.card.room-head` | `nav.crumbs` (`a[href="#/rooms"]` `Rooms`, then ` › ` and the name); `h2#rpName`; `span.tag#rpInfo` (`infoText`); `span.chip#rpState` (`{ lvl: 'good', icon: '✓', text: 'Running' }` or `{ lvl: 'serious', icon: '▲', text: stateText(room) }`); `span.chip#rpAlarms` (`alarmsChip(live.alarms)`); `button.btn#rpRestart` `Restart` (hidden while `live.running`); `span.tag#rpFeed` (`role="status"`: `Live` / `Reconnecting…`); `p.tag#rpMsg` (`role="status"`) |
| 2 | Tabs | `nav.room-tabs[aria-label="Room views"]` | One `a` per `FarmRoomTabs.NAMES` entry, texts `Live`, `Simulate`, `Calibrate`, `href="#/rooms/<id>/<tab>"`; `aria-current="page"` on the shown tab only |
| 3 | Tab host | `div.contents#roomTab` | The tab's markup |

| Moment | Action |
|---|---|
| `mount(el, params)` | `id = params.id`, `tab = params.tab`, `tabParams = params.runId ? { runId: params.runId } : {}`. Markup; `close = FarmApi.stream(onEvent)` (one stream per room page; open first, then load) |
| First `open` | `#rpFeed` = `Live`. `rows = await listRooms()`; no row with `id` → replace `el`'s content with `p.est-note` `This room does not exist or is archived.` and `a[href="#/rooms"]` `Rooms`, close the stream, stop. Else `room = row`; paint the header; mount the tab `tab` (row "Mount a tab"). Events of this room that arrive before the reply are applied to `room` when it lands; a `reading` is passed to the tab only after the tab is mounted |
| Mount a tab | `t = FarmRoomTabs.get(tab)`. Not registered: `#roomTab` = `p.est-note` `This tab is not installed.` Else build `ctx` (row "ctx"); `r = t.mount(#roomTab, ctx)`; a throw, or a returned Promise that rejects while this tab is still the current one, puts `p.est-note` `This tab could not be opened: <message>` in `#roomTab` and logs the error |
| `ctx` | `{ id, params: tabParams, room: () => room, on(type, fn) }`. `on` adds `fn` to the listener list of `type` (`reading`, `event`, `alarm`, `settings`, `room`, `open`, `down`) and returns `off()`. Each `ctx` has its own lists; they are dropped when its tab unmounts, so a listener never runs after its tab's `unmount` |
| Dispatch | After the frame's own handling of a stream event, in arrival order: `reading`, `event`, `alarm`, `settings` with `data.room_id === id` → the tab's listeners of that type (`fn(data)`); `open` with `reconnect: true` → the `open` listeners (`fn(data)`); every `down` → the `down` listeners; a change of the page's Room (a `room` event of this room, the refresh reply, the **Restart** reply, the reconnect reload) → the `room` listeners (`fn(room)`). A listener that throws is logged with `console.error`; the others still run |
| `reading` (this room) | `room.live.reading` = `data` when newer by `t`; then the refresh (5.3 row "Refresh", one timer per page) |
| Refresh reply | Row with `id`: `room = refreshRoom(room, row)`; repaint the header; pass `room` to the tab. No row: nothing (the `room` event of an archive handles it) |
| `room` (this room) | `archived_at !== null`: unmount the tab, the "does not exist" content, close the stream, stop. Else `room = data`; repaint the header; pass to the tab |
| `open` with `reconnect: true` | `#rpFeed` = `Live`; dispatch to the tab; `rows = await listRooms()`: the row → `room = refreshRoom(room, row)`, repaint, pass to the tab; no row → the "does not exist" content as at the first `open` (C4 10.4 "Room header and live values") |
| `down` | `#rpFeed` = `Reconnecting…`; dispatch to the tab |
| **Restart** | Button disabled; `room = await restartRoom(id)`; repaint; pass to the tab (a loop that fails again still answers 200 with `live.running: false`, C3 6.19). `ApiError`: `errorText` in `#rpMsg`, button enabled |
| `update(params)` (same `id`) | Unmount the current tab (in `try`; its listeners dropped); empty `#roomTab`; set `aria-current` on the new tab link; `tab = params.tab`, `tabParams = params.runId ? { runId } : {}`; when the first `open` has loaded the Room, mount the new tab now, else it is mounted when the Room arrives; return `true`. No `listRooms()` call, no new stream |
| `unmount` | Each step in its own `try`: `alive = false`; unmount the tab; `close()` the stream; `clearTimeout` of the refresh timer |

### 5.5 Texts (exact)

| Where | Text |
|---|---|
| Home explain | The two texts of 5.3 row 1 |
| New room done | `Created "<name>". It starts running at once (simulated, default settings).` |
| Import | `Create <n> room(s) from this browser on the farm server? Each one starts running as a simulated room.`; `Importing room <k> of <n>…`; `Imported <n> room(s). Run the check again for each room.`; `The import stopped at "<name>": <errorText>. <k> room(s) were created; archive them on their room pages before you import again.` |
| Room missing | `This room does not exist or is archived.` |
| Tab missing | `This tab is not installed.` |
| Tab failed | `This tab could not be opened: <message>` |
| Feed | `Live`, `Reconnecting…` |
| Status chip | `Stopped`, `<n> alarm`, `<n> alarms`, `Out of band`, `All good` |
| Header | `Running`, `Stopped: <error>`, `No alarms`, `<n> alarm`, `<n> alarms`, `Restart` |

### 5.6 The `/* Room page */` CSS block (appended to `styles.css`)

One block at the very end, starting with the comment line `/* Room page */`. It names every class of C5 3.8; it changes no existing rule. Use the existing variables (`--band`, `--border`, `--muted`, `--ink-2`, `--s-ac`, `--surface`, the `--good` … `--critical` levels) so both themes work; no `!important`.

| Selector | Rule |
|---|---|
| `.explain` | `grid-column: 1 / -1`; `margin: 0`; `color: var(--ink-2)`; `max-width: 70ch` |
| `.room-card` | `grid-column: span 4` (`span 6` under 1100 px, `span 12` under 720 px); `display: grid; gap: 8px`; the inner `a.room-link` `color: inherit; text-decoration: none; display: grid; gap: 6px` |
| `.room-new` | `grid-column: span 12`; a wrapping flex row of its labels, inputs and buttons (`gap: 8px 12px; align-items: end`) |
| `.rc-values` | `display: flex; flex-wrap: wrap; gap: 6px 16px`; its `.val` in `var(--font-mono)`, 20 px |
| `.rc-crop` | `margin: 0; font-weight: 600` |
| `.crumbs` | `font-size: 13px; color: var(--muted)`; links `color: inherit` |
| `.room-head` | `grid-column: 1 / -1`; a wrapping flex row (`gap: 6px 12px; align-items: center`) |
| `.room-tabs` | `grid-column: 1 / -1; display: flex; gap: 4px; border-bottom: 1px solid var(--border)`; links `padding: 6px 12px; color: inherit; text-decoration: none; border-bottom: 2px solid transparent` |
| `.room-tabs [aria-current="page"]` | `border-bottom-color: var(--ink); font-weight: 600` |
| `.room-live` | `grid-column: span 12`; a wrapping flex row of its values |
| `.room-air` | `grid-column: span 6` (`span 12` under 720 px); used by the Live tab's air card (`section.card.room-air`) and its glance row (`div.room-air`, which also gets `display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline`) |
| `.room-versions`, `.room-details` | `grid-column: span 6` (`span 12` under 1100 px) |
| `.room-msg` | `grid-column: 1 / -1; margin: 0; list-style: none; padding: 0; color: var(--muted); font-size: 14px` |
| `.run-progress` | `position: relative; height: 22px; line-height: 22px; padding: 0 8px; background: var(--band); border-radius: 4px; overflow: hidden; font: 12px var(--font-mono)`; `.run-progress > span:first-child` (the fill; its width set inline as a percentage) `position: absolute; left: 0; top: 0; bottom: 0; background: var(--s-ac); opacity: .3`; `.run-progress > span + span` (the text, when a tab uses one) `position: relative` |
| `.run-list` | `width: 100%; border-collapse: collapse`; cells `padding: 4px 8px; border-bottom: 1px solid var(--border); text-align: left` |
| `.mix-table` | As `.run-list`; its `input[type="number"]` `width: 90px` |
| `.result-card` | `grid-column: 1 / -1; display: grid; gap: 8px; overflow-x: auto` |
| `.fit-table` | As `.run-list` |
| `.pvr-card` | `grid-column: 1 / -1; display: grid; gap: 8px` |
| `.equip-form` | `display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px 12px` (the 7 machine fields in two rows; one column under 720 px) |
| `.equip-bar` | `display: inline-block; width: 120px; height: 8px; background: var(--band); border-radius: 4px; overflow: hidden; vertical-align: middle`; `.equip-bar span` `display: block; height: 100%; background: var(--s-ac)` (its width = the share %, set inline by the card) |
| `.cal-charts` | Already defined (wave 1, `styles.css` lines 446–451): add only `grid-column: 1 / -1` so each `drawCalibCharts` host spans the room page grid |

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, then implement, see it pass, `npm test`, commit)

### 6.1 Test files

`tests/web-shell.test.js` keeps the wave 1 DOM-stub approach (no browser), extended:

```js
// web/shell.js routing, against a tiny DOM stub (no browser). docs/contracts/web.md section 2, C10 11.
const test = require('node:test');
const assert = require('node:assert/strict');
const listeners = {};
const view = { children: [], attributes: [], replaceChildren(...c) { this.children = c; }, append(...c) { this.children.push(...c); }, removeAttribute() {} };
const link = module => ({ dataset: { module }, attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; } });
const links = [link('rooms'), link('batches'), link('simulator')];
globalThis.document = {
  addEventListener(n, f) { listeners['doc:' + n] = f; },
  getElementById: () => view,
  querySelectorAll: sel => (sel === '#menu a' ? links : []),
  createElement: () => ({ className: '', textContent: '' }),
  body: { dataset: {} },
  title: '',
};
globalThis.location = { hash: '', replace(h) { this.hash = h; } };
globalThis.addEventListener = (n, f) => { listeners[n] = f; };
require('../web/shell.js');
const FarmShell = globalThis.FarmShell;
function go(hash) { location.hash = hash; listeners.hashchange(); }
const marked = () => links.filter(l => l.attrs['aria-current'] === 'page').map(l => l.dataset.module);
```

`tests/web-rooms.test.js`:

```js
// web/rooms.js helpers (docs/contracts/web.md 3.7, 3.8). The module registers into a local object.
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
require('../web/rooms.js');
const H = registered.rooms.helpers;
const R = { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: 1791446400, archived_at: null,
  live: { reading: { room_id: 1, t: 1791450000, T: 18.2, RH: 88.4, CO2: 812, t_out: 31.5, rh_out: 62, ac_mode: 'cool', ac_setpoint: 17.5,
    fog: 1, air: 0, lights: 1, circ: 0, power_w: 1430, kwh: 12.84, ac_fan: 'auto', stage: 'fruiting', core: 19.1 },
    stage: 'fruiting', crop: 'oyster', targets: { T: 18, RH: 88, CO2: 1000 },
    status: { T: { lvl: 'good', icon: '✓', text: 'In band' }, RH: { lvl: 'good', icon: '✓', text: 'In band' }, CO2: { lvl: 'good', icon: '✓', text: 'Below limit' } },
    alarms: 0, running: true, error: null, flush: 1, blocks: 2000, air: null } };
const live = over => ({ ...R, live: { ...R.live, ...over } });
```

`R` is C3 3.1's example (with `air: null`). `1791450000` is `2026-10-08 17:00:00` farm time.

### 6.2 Tasks

| # | Test(s) first | Then build | What it proves |
|---|---|---|---|
| 0 | – | Section 2 checks; read the files listed there. No commit | The start state |
| 1 | `tests/web-shell.test.js` **SH1 parseHash** (one `assert.deepEqual` per row): `#/rooms` and `#/rooms/` → `{ name: 'rooms', params: {} }`; `#/rooms/3` → `{ redirect: '#/rooms/3/live' }`; `#/rooms/3/live`, `/simulate`, `/calibrate` (and with a trailing `/`) → `{ name: 'rooms', params: { id: 3, tab } }`; `#/rooms/3/calibrate/12` → `{ name: 'rooms', params: { id: 3, tab: 'calibrate', runId: 12 } }`; `#/rooms/999999999999999/live` → `id` 999999999999999; `#/simulator` → `{ name: 'simulator', params: {} }`; `#/simulator/2` → `{ name: 'simulator', params: { roomId: 2 } }`; `#/batches` → `{ name: 'batches', params: {} }`; `#/batches/4` → `{ name: 'batches', params: { id: 4 } }`; `#/harvest/stickers` (and `#/harvest/stickers/`) → `{ name: 'harvest', params: { view: 'stickers' } }`; `#/harvest/3` → `{ name: 'harvest', params: { view: 'record', id: 3 } }`; `null` for `#/capacity`, `#/calibration`, `''`, `#`, `#/`, `#rooms`, `#//simulator`, `#/rooms//3`, `#/rooms/0`, `#/rooms/1234567890123456`, `#/rooms/3/settings`, `#/rooms/3/simulate/5`, `#/rooms/3/calibrate/0`, `#/rooms/3/live/1`, `#/simulator/0`, `#/batches/x`, `#/harvest`, `#/harvest/0`, `#/harvest/stickers/1`, `#/rooms?x=1`, `#/nowhere`. **SH2 MENU_NAMES** deep-equals `{ rooms: 'Rooms', simulator: 'Test bench', batches: 'Batches', harvest: 'Harvest' }` and `Object.isFrozen` is true | `parseHash`, `MENU_NAMES` as members of `FarmShell` (5.1) | C5 2.1, 2.2, C10 11 |
| 2 | **SH3 redirects**: `go('#/rooms/3')` → `location.hash === '#/rooms/3/live'`, nothing mounted; `go('#/capacity')`, `go('#/calibration')`, `go('#/nowhere')` → `location.hash === '#/rooms'`, nothing unmounted or mounted. **SH4 update**: register `rooms` with `mount`, `unmount` and an `update` that records its params and returns a value the test sets; `go('#/rooms/3/live')` mounts `{ id: 3, tab: 'live' }`; `go('#/rooms/3/simulate')` with `update` → `true`: `update` got `{ id: 3, tab: 'simulate' }`, no unmount, no mount; then `go('#/rooms/3/simulate')` again: nothing (same params); `go('#/rooms/4/live')` with `update` → `false`: one unmount, one mount `{ id: 4, tab: 'live' }`; an `update` that throws: logged, then unmount and mount. **SH5 menu, title, layout**: `go('#/rooms/1/live')` → `marked()` `['rooms']`, `document.title === 'Rooms · Mushroom farm'`, `'layout' in document.body.dataset === false`; `#/simulator/1` → `['simulator']`, `Test bench · Mushroom farm`; `#/batches/4` → `['batches']`; `#/harvest/stickers` → `['batches']`, `Harvest · Mushroom farm`, no layout; `#/harvest/1` → `[]`, `document.body.dataset.layout === 'bare'`; then `#/rooms` → `['rooms']` and no `layout` key; a tab switch through `update` (`true`) also sets `marked()` and the title. **SH6 not installed**: `go('#/batches')` with `batches` unregistered → `view.children[0].textContent === 'This part of the app is not installed.'`. **SH7 late rejection** (the two wave 1 tests, kept with the new routes: `#/rooms/1/live`, `#/rooms/2/live`) | `route()` steps 1, 2, 5 (5.1); keep the rest of wave 1's `route()` | C5 2.3, lead decisions 15, 66 |
| 3 | `tests/web-rooms.test.js` **RS1 module**: `registered.rooms` has `mount`, `unmount`, `update` functions and a `helpers` object with `statusChip`, `cropText`, `cardTexts`, `machineLines`, `infoText`, `stateText`, `alarmsChip`, `upsertRoom`, `takeLive`, `refreshRoom`, `refreshDelay`, `newRoomName`, `readStored`, `importPlan`, `importRooms`; loading did no DOM work (Node has no `document`); `registered.rooms.unmount()` before any mount does not throw; `registered.rooms.update({ id: 1, tab: 'live' })` before any mount returns `false` | Skeleton: wrapper, `register('rooms', { mount, unmount, update, helpers })` | C5 1.4, 3.1, 3.8 |
| 4 | **RS2 statusChip** precedence: `R` → `{ lvl: 'good', icon: '✓', text: 'All good' }`; `live({ status: { ...R.live.status, RH: { lvl: 'warning', icon: '▲', text: 'High' } } })` → `{ lvl: 'info', icon: '•', text: 'Out of band' }`; `live({ alarms: 1 })` → `{ lvl: 'warning', icon: '▲', text: '1 alarm' }`; `live({ alarms: 2, status: <the warning status> })` → `2 alarms` (alarms beat out of band); `live({ running: false, error: 'boom', alarms: 2 })` → `{ lvl: 'serious', icon: '▲', text: 'Stopped' }` (stopped beats alarms); `live({ status: null })` → `All good`; `{ ...R, live: null }` → `Stopped`. **RS3 cardTexts**: `R` → `{ name: 'Room 1', crop: 'Grey oyster · Fruiting · flush 1 · 2000 blocks', air: 'Air exchange off', T: '18.2 °C', RH: '88 % RH', CO2: '812 ppm', machines: 'AC Cool 17.5 °C · Fogger level 1 · Lights on · Circulation fan off · Power 1.43 kW', stopped: null }`; `reading.air: 1` → `Air exchange on`; `live({ reading: null })` → `air` `–`, `T` `— °C`, `RH` `— % RH`, `CO2` `— ppm`, `machines` `''`; `live({ flush: null, blocks: null })` → `crop` `Grey oyster · Fruiting`; `live({ crop: 'lionsmane-x', stage: 'pinning' })` → `crop` starts `lionsmane-x · Pinning`; `live({ crop: null })` → `crop` starts `–`; `live({ running: false, error: 'boom' })` → `stopped` `Stopped: boom`; with `error: null` → `Stopped`. **RS4 machineLines**: AC off, `fog: 0`, `lights: 0`, `circ: 1`, `power_w: null` → `['AC off', 'Fogger off', 'Lights off', 'Circulation fan on']`; `null` → `[]` | `statusChip`, `cropText`, `cardTexts`, `machineLines` | C5 3.8 home card, delta review M6 |
| 5 | **RS5 header texts**: `infoText(R)` = `Grey oyster · Fruiting · flush 1 · 2000 blocks · 60 m³`; `blocks: null` → `Grey oyster · Fruiting · flush 1 · 60 m³`; `flush: null, blocks: null` → `Grey oyster · Fruiting · 60 m³`; `stateText(R)` = `Running`; `stateText(live({ running: false, error: 'boom' }))` = `Stopped: boom`; `alarmsChip(0)` = `{ lvl: 'good', icon: '✓', text: 'No alarms' }`; `alarmsChip(1).text` = `1 alarm`; `alarmsChip(3)` = `{ lvl: 'warning', icon: '▲', text: '3 alarms' }`. **RS6 room lists**: `upsertRoom([r1, r3], r2)` → ids `[1, 2, 3]`; a renamed `r3` replaces it; `r1` with `archived_at: 5` → `[2, 3]`; an archived unknown id → unchanged; inputs unchanged. `takeLive([R, r2], [<R with new status, new targets, other reading>])`: the first has the new `status` and `targets` and the old `reading`; `r2` is the same object; a reply-only room is not added. `refreshRoom(R, row)` with `row.live.reading.t` = `R`'s − 30 and `row.live.air` = `{ on: true, … }`: the result has `row`'s `air`, `flush`, `blocks`, `status`, `targets` and `R`'s reading; with `row`'s reading newer: `row`'s reading. `refreshDelay(null, 5)` = 0; `(1000, 11000)` = 20000; `(1000, 40000)` = 0. `newRoomName('  ', 2)` = `Room 3`; `(' Shed ', 2)` = `Shed` | `infoText`, `stateText`, `alarmsChip`, `upsertRoom`, `takeLive`, `refreshRoom`, `refreshDelay`, `newRoomName` | C5 3.4, 3.8 |
| 6 | **RS7 readStored**: a storage stub `{ getItem: () => JSON.stringify({ version: 1, rooms: [null, { name: 'A', volume: 80, vent: 'exhaust', mix: [{ crop: 'oyster', blocks: 900 }] }, 'bad'] }) }` → one entry, `i === 1`, `room.name === 'A'`, `'vent' in room === false`; a throwing `getItem`, `'{'` and `null` → `[]`. **RS8 importPlan** (`nowS = 1791450000`): a room named `'   '` at `i = 2` → `room` deep-equals `{ name: 'Room 3', volume: <its volume> }`; a mix row without `co2PerBlock` → `co2_per_block: null`, with 55 → 55; `calib: null` → `calibration: null`; a valid calib `{ ua: 120, infAch: 0.5, moistBuffer: 3, co2PerBlock: 50, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date: '2026-10-01T04:00:00.000Z' }` → exactly `{ ua: 120, inf_ach: 0.5, moist_buffer: 3, co2_per_block: 50, rmse_t: 0.2, rmse_rh: 1.5, rmse_co2: 30, log_rows: null, source: 'import', run_at: 1790827200 }`; a date after `nowS + 60`, `''` or `'nonsense'` → no `run_at` key; `rmse.T` = `-1`, `NaN` or missing → `rmse_t: null`; `ClimateRoomRules.checkRoom(plan.room, false)` and `checkMix(plan.mix)` give `[]` (no `checkCalibration` assertion: its `source` rule is Server 2's wave 2 change). **RS9 importRooms**: a recording stub (each function pushes `[name, ...args]`; `createRoom` resolves `{ id: 10 + k, name }`, `saveCalibration` resolves `{ id: 90 }`); two entries, the first calibrated: the calls are exactly `createRoom`, `saveMix(11, …)`, `saveCalibration(11, …)`, `applyCalibration(11, 90)`, `createRoom`, `saveMix(12, …)`; result `{ created: 2, failed: null }`; `onRoom` got `(1, 2)`, `(2, 2)`. The second `createRoom` rejects → `{ created: 1, failed: { name: <its name>, error } }` and no call after it; the first `saveMix` rejects → `created: 1`, no further call; a stub that throws synchronously is handled the same way. **RS10 import on the wire**: `const { startFakeApi } = require('./fakes/api-server.js')`; `fake = await startFakeApi()`; `FarmApi.base = fake.url`; `fake.reply('POST', '/api/rooms', 201, { id: 7, name: 'North' })`; `fake.reply('POST', '/api/rooms/7/calibrations', 201, { id: 3 })`; `importRooms` of one calibrated entry with `FarmApi` → the `/api/` entries of `fake.requests` are exactly `POST /api/rooms` (the `importPlan` room body), `PUT /api/rooms/7/mix` (its rows), `POST /api/rooms/7/calibrations` (its calibration body), `POST /api/rooms/7/calibrations/3/apply` (body `null`); `await fake.close()` in `t.after` | `readStored`, `importPlan`, `importRooms` | C5 3.7, C3 8.1 |
| 7 | No Node test (DOM) | The home (5.3) and the frame (5.4), with every decision kept in the tested helpers | Task 9 |
| 8 | No Node test | The CSS block (5.6) | Task 9 |
| 9 | Headless Chrome (section 7.2), after gate 2.5 | Fix what it finds; a Node test first for any helper bug | C5 7.10 row "Room shell" |
| 10 | – | Section 7.1; commit; report (section 10) | – |

| Point | Rule |
|---|---|
| Test names | Start each new test with its id (`test('SH4 update keeps the module mounted', …)`). One `test(…)` per id: SH1–SH7, RS1–RS10 |
| Exact texts | Assert every text of 5.5 and C5 3.8 word for word |

## 7. How to verify

### 7.1 Commands (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check web/shell.js && node --check web/rooms.js` | No output, exit 0 |
| `node --disable-warning=ExperimentalWarning --test tests/web-shell.test.js tests/web-rooms.test.js` | `# fail 0`; SH1–SH7 and RS1–RS10 listed |
| `npm test` | `# fail 0`; `# pass` = `N0` + your new tests − the wave 1 tests of `tests/web-shell.test.js` you replaced (write the numbers in the report); `# skipped` = `K0` |
| `npm test 2>&1 \| grep -c '^ok .* - vectors: '` | The same count as at the start (you change no vector) |
| `git diff --name-only $(git merge-base HEAD master)` | Only the five files of section 3 |
| `git diff $(git merge-base HEAD master) -- styles.css \| grep '^-' \| grep -v '^---'` | No output (only added lines) |
| `git diff $(git merge-base HEAD master) -- styles.css \| grep -c '/\* Room page \*/'` | `1` |
| `grep -n "setTimeout\|setInterval" web/rooms.js` | Only the refresh timer (one per page) |
| `grep -n "document.body" web/rooms.js` | No output (C5 3.1) |
| `node -e "globalThis.FarmShell={register(){}};require('./web/rooms.js')"` | No output, exit 0 |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git status --short` | Empty |

### 7.2 Headless Chrome, after gate 2.5 (C5 7.10 rows "how wave 2 checks run" and "Room shell")

Run only when the lead says gate 2.5 passed. Drive Chrome with the chrome-devtools MCP tools (`new_page`, `navigate_page`, `evaluate_script`, `click`, `fill`, `handle_dialog`, `resize_page`, `list_console_messages`, `list_network_requests`) or with `cdp.js` of `web-split.md` Appendix A, copied into a scratch folder made with `mktemp -d` (never into the repo). Wait about 300 ms after each hash change.

| Step | Shell |
|---|---|
| Check tree (the gate 2.5 `master` plus your files) | `T=$(mktemp -d); git -C <worktree> archive master \| tar -x -C $T; MB=$(git -C <worktree> merge-base HEAD master); git -C <worktree> archive HEAD -- $(git -C <worktree> diff --name-only $MB HEAD) \| tar -x -C $T` |
| Free port | `PORT=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")` |
| Server (background) | `cd $T && FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$T/check.db npm start` → prints `Open http://127.0.0.1:<PORT>`; the empty database gets `Room 1` (id 1), a reading every 30 s |
| Seed flush and blocks | `API=http://127.0.0.1:$PORT/api; curl -s -X PUT $API/rooms/1/mix -H 'Content-Type: application/json' -d '[{"crop":"oyster","blocks":2000,"co2_per_block":null}]'; curl -s -X POST $API/rooms/1/restart` (the demo room's mix is empty, so `live.blocks` is `null` until a mix and a restart) |

On this tree the tabs are the prep 2.0 stubs and `web/batches.js`, `web/harvest.js`, `web/harvest.css` are stubs: they show the "not installed" notices; that is expected.

| # | Step | Expected |
|---|---|---|
| H1 | Open `http://127.0.0.1:<PORT>/`; wait up to 35 s for a reading | Hash `#/rooms`; the Rooms link has `aria-current="page"`; one `section.room-card[data-room-id="1"]` with `h3` `Room 1`; `p.rc-crop` = `Grey oyster · Fruiting · flush 1 · 2000 blocks`; `p.rc-air` is `Air exchange on` or `Air exchange off`; the three values are numbers (not `—`); the status chip text is one of `All good`, `Out of band`, `<n> alarm(s)`; two `p.explain` with the C5 3.8 texts |
| H2 | Note `.rc-values` `data-t`; wait up to 35 s | `data-t` changes without a page reload |
| H3 | Click the card | Hash `#/rooms/1/live`; `#rpName` `Room 1`; `#rpInfo` = `Grey oyster · Fruiting · flush 1 · 2000 blocks · 60 m³`; `#rpState` `Running`; `#rpRestart` hidden; `#rpAlarms` `No alarms` (or `<n> alarm(s)`); `#rpFeed` `Live`; three tab links `Live`, `Simulate`, `Calibrate`, the first with `aria-current="page"`; `#roomTab` text `This tab is not installed.` |
| H4 | `history.length` as `n`; `location.hash = '#/rooms/1'` | Hash becomes `#/rooms/1/live`; `history.length === n + 1` (the hash set adds one entry, the shell's `location.replace` adds none) |
| H5 | `window.__h = document.getElementById('rpName')`; count the `GET /api/rooms` requests so far (`list_network_requests` or `performance.getEntriesByType('resource')`) as `c`; click `Simulate`, then `Calibrate` (within 10 s of the last reading) | Hash `#/rooms/1/simulate`, then `#/rooms/1/calibrate`; `document.getElementById('rpName') === window.__h` (the header was not rebuilt); `aria-current` moves to the clicked link; `#roomTab` shows `This tab is not installed.` each time; the `GET /api/rooms` count is still `c` right after each switch (a refresh after a new reading may add one; wait for none in flight before counting) |
| H6 | `location.hash = '#/capacity'`, then `'#/calibration'` | Hash `#/rooms` each time |
| H7 | Read `#menu a` | Texts `Rooms`, `Batches`, `Test bench`, in that order |
| H8 | `#/batches` | The Batches link marked; `#view` text `This part of the app is not installed.`; `document.title === 'Batches · Mushroom farm'` |
| H9 | `#/harvest/stickers` | The Batches link marked; `'layout' in document.body.dataset === false` |
| H10 | `#/harvest/1` | No link marked; `document.body.dataset.layout === 'bare'`; `document.title === 'Harvest · Mushroom farm'`. No assertion on the bar's visibility (`web/harvest.css` is the stub) |
| H11 | `#/rooms` | `'layout' in document.body.dataset === false`; the Rooms link marked |
| H12 | `#/rooms/999/live` | `#view` holds only `This room does not exist or is archived.` and a link to `#/rooms` |
| H13 | On `#/rooms`: `#rhName` `Shed B`, `#rhVolume` 80, click `#rhCreate` | A card `Shed B` appears after `Room 1`; `#rhMsg` = `Created "Shed B". It starts running at once (simulated, default settings).`; `GET $API/rooms` lists it with `volume` 80 |
| H14 | `#rhVolume` 4, click `#rhCreate` | `#rhMsg` starts with `Invalid room:`; no new card |
| H15 | `localStorage.removeItem('mushroom-farm.rooms.v1.imported'); localStorage.setItem('mushroom-farm.rooms.v1', JSON.stringify({ version: 1, rooms: [ { id: 'a', name: 'North room', volume: 80, vent: 'exhaust', calib: { ua: 120, infAch: 0.5, moistBuffer: 3, co2PerBlock: 50, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date: '2026-10-01T04:00:00.000Z' }, mix: [ { crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 300, co2PerBlock: 55 } ] }, { id: 'b', name: 'South room', volume: 40, calib: null, mix: [] } ] }))`; reload | `#rhImport` visible |
| H16 | Click `#rhImport`, accept the `confirm` | `#rhMsg` = `Imported 2 room(s). Run the check again for each room.`; cards `North room` and `South room` appear |
| H17 | `fetch` `/api/rooms`, then North's `/mix` and `/calibrations`, South's too | `North room` volume 80, `South room` volume 40; North mix `[{ crop: 'oyster', blocks: 1200, co2_per_block: null }, { crop: 'pink', blocks: 300, co2_per_block: 55 }]`; North calibrations: one run, `applied: true`, `source: 'import'`, `run_at: 1790827200`, `log_rows: null`, `ua` 120; South: `[]` and `[]`; `localStorage['mushroom-farm.rooms.v1.imported']` is set |
| H18 | Reload | `#rhImport` hidden |
| H19 | At 375 × 812 and 1280 × 800, light and dark (`#themeBtn`): `#/rooms` and `#/rooms/1/live` | `document.documentElement.scrollWidth <= innerWidth` (nothing overflows sideways) |
| H20 | Restart against the fake: a script in the scratch folder runs `const { startFakeApi } = require('<T>/tests/fakes/api-server.js'); api = await startFakeApi({ root: '<T>' })`, sets the replies below before the page loads, prints `api.url` and each new `/api/` entry of `api.requests` as one JSON line. `R` = `{ id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: 1791446400, archived_at: null, live: { reading: null, stage: 'fruiting', crop: 'oyster', targets: null, status: null, alarms: 0, running: false, error: 'boom', flush: null, blocks: null, air: null } }`; `R2` = `R` with `live.running: true`, `live.error: null`. Replies: `GET /api/rooms` → 200 `[R]`; `POST /api/rooms/1/restart` → 200 `R2`. The fake sends no `: ping`: finish each row within 45 s of opening the page | – |
| H21 | Open `<api.url>/#/rooms`; click `.rc-restart` | Before: the card's chip `Stopped`, `Stopped: boom`, **Restart** visible. Exactly one `POST /api/rooms/1/restart` with `body` `null`. After: chip `All good`, no `Stopped` text, no **Restart** |
| H22 | Open `<api.url>/#/rooms/1/live` (the fake still answers `[R]`); click `#rpRestart` | Before: `#rpState` `Stopped: boom`, `#rpRestart` visible. Exactly one more `POST /api/rooms/1/restart`, `body` `null`. After: `#rpState` `Running`, `#rpRestart` hidden |
| H23 | The console for the whole session (both servers) | No errors; no 404 except `/favicon.ico` |
| End | Stop both servers; `rm -rf $T` and the scratch folder | – |

## 8. Done when

| # | Item |
|---|---|
| 1 | Every start check of section 2 held (or the lead answered) |
| 2 | `web/shell.js` parses every route of C5 2.1 with `parseHash` and `MENU_NAMES` as members, runs the 7 steps of C5 2.3 with `update(params)`, marks the menu per route and sets or removes `body[data-layout]` (SH1–SH7) |
| 3 | `web/rooms.js` replaces the stub, registers `rooms` with `mount`, `unmount`, `update`, `helpers`, defines no global, does no DOM work at load; every helper of 5.2 is tested (RS1–RS10) |
| 4 | Home and frame use exactly the ids, texts and behaviour of 5.3–5.5; one stream per page; the only data timer is the refresh; a tab switch makes no `GET /api/rooms` and no new stream |
| 5 | `styles.css` gains only the `/* Room page */` block of 5.6 at its end |
| 6 | `npm test` `# fail 0`, `# skipped` = `K0`; only the five owned files differ from the merge base |
| 7 | Every headless row H1–H23 passed after gate 2.5, with no console error |
| 8 | Committed on `stream/room-shell` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit `index.html`, `web/room-tabs.js`, `web/api.js`, a tab file, `web/harvest.css` or any file outside section 3 | File owners (wave 2 plan 3.1); report what you need |
| Change or reorder an existing CSS rule, or add CSS anywhere but the one appended block | Lead decision 32 |
| Put the harvest `.bar` rule or any `.bt-*`, `.bd-*`, `.hv-*`, `.st-*` class in `styles.css` | Lead decision 65: `web/harvest.css` is Harvest web's |
| Let a module or the frame touch `document.body` | C5 3.1: `data-layout` is the shell's |
| Mount a tab any other way than through `FarmRoomTabs.get(name).mount(el, ctx)`, or give a tab its own stream | C5 3.9, lead decision 16 |
| Call `listRooms()` on a tab switch, open a second stream per page, add a timer besides the refresh, or refresh more than once per 30 s | C5 3.4, 3.8 |
| Compute targets, status or alarms in the browser, or run a controller | The server runs the controller |
| Write, change or remove `mushroom-farm.rooms.v1`; send `vent` or `settings` with `createRoom` | C5 3.7, C3 8.1, C9 6.3 |
| Put dynamic text (room names, server texts) into `innerHTML` | C5 1.4 |
| Add members to `FarmShell` beyond `register`, `MENU_NAMES`, `parseHash`, `level`, or a global | C5 2.2, 1.4 |
| Push, merge, rebase, merge `master` into your branch, or change git config | The lead merges after review |

## 10. Report to the lead

| Item | Content |
|---|---|
| Result | Done or blocked; `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | `N0`, `K0`, the final `npm test` counts, the wave 1 shell tests you replaced |
| Headless | One line per row H1–H23: pass or fail, with what you saw |
| Points to confirm | (1) `helpers` on the registered object (C5 3.1 lists no such member, C5 3.8 names the helpers); (2) the extra helpers of 5.2 (`cropText`, `machineLines`, `stateText`, `alarmsChip`, `upsertRoom`, `takeLive`, `refreshRoom`, `refreshDelay`, `newRoomName`); (3) the icons of the status chips (`FarmUi.ICON`); (4) the frame passes the whole refresh row to the tab (`refreshRoom`), the home only `status` and `targets`; (5) the ids `rh*` of the home; (6) the card as one link with the **Restart** row outside it |
| Anything else | Every contract gap or mismatch you met, and what you did instead of guessing |

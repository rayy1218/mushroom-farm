# Contract C12: UX wave 2 (app layout)

Date: 2026-10-12. Status: **frozen** (revision 1). Changes only through the lead (`docs/contracts/LEAD-DECISIONS.md`, decisions 96 on).
Source: `docs/reviews/2026-10-12-farmer-and-design-review.md` (target layout, navigation table, wave 2 row); builds on C11 (`docs/contracts/ux.md`), whose classes and helpers stay in force.
Where C12 names a route, text, class or behaviour that C5, C10 or C11 also names, **C12 wins**. Each stream updates the tests that pinned the old behaviour.

## 1. Streams

| Wave | Stream | Branch / worktree | Owns (only these files change) | Done when |
|---|---|---|---|---|
| prep | Lead | `ux/wave2` | Routing in `web/shell.js` (`parseHash`, `route`, `menuLink`, `setLevel`, level storage), `web/room-tabs.js`, the tab-name rename in `web/room-live.js`, `web/rooms.js`, `web/harvest.js`, `web/ui.js`, the stubs, `index.html` script and link tags, this file | Section 2 built and tested (done before the streams start) |
| 1 | **Shell** | `stream/ux2-shell` | `index.html` (layout only; keep every script and link tag and their order), `styles.css`, `web/shell.js` (everything except section 2's routing rules), `web/settings-page.js`, `tests/web-shell.test.js`, new `tests/web-settings-page.test.js` | Section 3 built; tests pass; screenshots |
| 1 | **Overview** | `stream/ux2-overview` | `web/overview.js`, `web/overview.css`, new `tests/web-overview.test.js` | Section 4 built; tests pass; screenshots |
| 1 | **Room** | `stream/ux2-room` | `web/rooms.js`, `web/room-live.js`, `web/room-settings.js`, `web/room.css`, `web/settings-panel.js`, `tests/web-rooms.test.js`, `tests/web-room-live.test.js`, new `tests/web-room-settings.test.js`, `tests/web-settings-panel.test.js`; in `tests/web-load.test.js` only the line marked `C12 prep` | Section 5 built; tests pass; screenshots |
| 1 | **Harvest** | `stream/ux2-harvest` | `web/harvest.js`, `web/harvest.css`, `web/batches.js`, `tests/web-harvest.test.js`, `tests/web-batches.test.js` | Section 6 built; tests pass; screenshots |

A stream that needs a change in a file it does not own asks the lead. The lead adds the new modules to `tests/web-load.test.js` L4 at integration; streams leave that test alone (except Room's one line). CSS: the Shell stream owns `styles.css` (the app shell, page head, global rules); every other stream puts its own rules in its own stylesheet and never restyles shell or C11 classes.

## 2. Lead prep (built)

### 2.1 Routes

| Hash | Module | Params | Notes |
|---|---|---|---|
| `#/overview` | `overview` | `{}` | **Default route** (`FarmShell.DEFAULT_ROUTE`); any unknown hash goes here |
| `#/rooms` | `rooms` | `{}` | Rooms list |
| `#/rooms/:id` | – | – | Redirects to `#/rooms/:id/overview` |
| `#/rooms/:id/live` | – | – | Old links: redirects to `#/rooms/:id/overview` |
| `#/rooms/:id/<tab>` | `rooms` | `{ id, tab }` | `tab` one of `overview`, `settings`, `simulate`, `calibrate`; `calibrate/:runId` as before |
| `#/batches`, `#/batches/:id` | `batches` | as before | |
| `#/harvest` | `harvest` | `{ view: 'today' }` | New: today's harvest across rooms |
| `#/harvest/stickers`, `#/harvest/:id` | `harvest` | as before | `#/harvest/:id` keeps the bare layout |
| `#/simulator`, `#/simulator/:id` | `simulator` | as before | Menu name **Test bench** |
| `#/settings` | `settings` | `{}` | New: the Settings page |

`MENU_NAMES`: `overview` Overview, `rooms` Rooms, `batches` Batches, `harvest` Harvest, `simulator` Test bench, `settings` Settings. The shell marks `aria-current="page"` on `#menu a` **and** `#tabbar a` whose `data-module` is the route's menu link (`harvest` for `#/harvest` and `#/harvest/stickers`; none for `#/harvest/:id`).

### 2.2 Room tabs

`FarmRoomTabs.NAMES` = `overview`, `settings`, `simulate`, `calibrate`. The old Live tab registers as `overview` (prep rename only). Until the Room stream builds `web/room-settings.js`, `#/rooms/:id/settings` shows "This tab is not installed."

### 2.3 Settings level

| Item | Rule |
|---|---|
| Storage | `localStorage['mushroom-farm.level']` = `farmer` or `installer`; missing or unreadable = `farmer`. |
| Switch | Any element with `data-level-btn="farmer"` / `"installer"` switches on click (`aria-pressed` kept in step); `FarmShell.setLevel(level)` does the same from code. Both fire the existing `farm-level` event. |
| Hiding | `body[data-level="farmer"] [data-level-only="installer"]` is hidden (Shell writes the CSS rule). Installer-only things: the Test bench menu entry, the room tabs Simulate and Calibrate, Settings versions, the rule editor (as today). No PIN (lead decision 97). |

### 2.4 Shared helpers in `FarmUi`

| Helper | Use |
|---|---|
| `pageHead({ title, sub, actions })` | Every top-level page (Overview, Rooms, Batches, batch page, Harvest, Stickers, Settings, Test bench is exempt) starts with it: `header.page-head > div.page-titles > h1.page-title + p.page-sub`, then `div.page-actions.btn-row` with the given elements. One `h1` per page. |
| `plainChip(kind, chip)` | Every controller status chip shown in the farmer screens (Overview, Rooms cards, room Overview tab) goes through it: `In band` → `OK`, `Above band` → `A bit warm` / `A bit wet`, `High alarm` → `Too hot` / `Too wet`, `Below limit` → `Fresh air OK`, `Purging` → `Airing out`, and so on (`web/ui.js` `PLAIN`). |
| `roomStatus(room)`, `manualText(list)`, `MACHINE_NAME` | The C11 5.1 room status and Manual text, shared so the Overview and the Rooms list agree. |

## 3. Shell (Shell stream)

### 3.1 Layout

```
desktop ≥ 900 px                                   phone < 900 px
+-----------+------------------------------------+  +------------------------------+
| Mushroom  | [farm status chip] [Simulated]     |  | Mushroom farm  [status chip] |
| farm      |------------------------------------|  |------------------------------|
|           | page head (title, sub, actions)    |  | page head                    |
| Overview  | page content (12-column grid)      |  | page content (one column)    |
| Rooms     |                                    |  |                              |
| Batches   |                                    |  |                              |
| Harvest   |                                    |  |------------------------------|
| Test bench|                                    |  | Overview Rooms Harvest       |
| Settings  |                                    |  | Batches More                 |
| --------- |                                    |  +------------------------------+
| Farmer |  |                                    |
| Installer |                                    |
| Theme     |                                    |
+-----------+------------------------------------+
```

| Part | Rule |
|---|---|
| Side bar `aside.side` | ≥ 900 px only, 232 px, full height, sticky. Brand at the top (`Mushroom farm`, small line `Climate and harvest`; **not** an `h1`). `nav#menu` with the six entries of 2.1 in that order, each `a[data-module]` with a small inline SVG icon and its name; Test bench has `data-level-only="installer"`. At the bottom the level switch (`.seg` with `[data-level-btn]`) and the theme button. |
| Top bar `header.topbar` | Sticky, in the main column. Left on phone: the brand. Right: the farm status chip `a#farmStatus.chip` → `#/overview` (`roomStatus` summed over `listRooms()` every 30 s: any Stopped → serious `N stopped`; else alarms → warning `N alarm(s)`; else any Check room → warning `N room(s) to check`; else good `All rooms OK`; no rooms → hidden) and `span#farmSim.chip[data-kind="sim"]` `Simulated` when every room's `adapter` is `sim`. A failed call keeps the last chips. |
| Tab bar `nav#tabbar` | < 900 px only, fixed at the bottom, five `a[data-module]` with icon and short label: Overview, Rooms, Harvest, Batches, More (`#/settings`, `data-module="settings"`); at least 56 px tall plus `env(safe-area-inset-bottom)`; `main` gets matching bottom padding. |
| Bare layout | `body[data-layout="bare"]` hides the side bar, top bar and tab bar (the phone harvest page). |
| `main#view` | Keeps the 12-column grid of C5; `.page-head` spans all columns. Max width 1480 px, centred in the main column. |
| Page head | `.page-head`: flex, wrap, `align-items: end`, gap 8–16 px, margin-bottom 4 px. `.page-title` `--fs-2xl` weight 700. `.page-sub` `--fs-md`, `--ink-2`, max 70ch. `.page-actions` pushed right on desktop, full width under the title on phone. |
| Theme | `localStorage['mushroom-farm.theme']` = `light`, `dark` or absent (follow the device). Applied before the first paint where possible. |
| Global rule | `body[data-level="farmer"] [data-level-only="installer"] { display: none !important; }` |

### 3.2 Settings page `#/settings` (`web/settings-page.js`)

| Card | Content |
|---|---|
| Page head | Title `Settings`, sub `How this screen looks and who uses it.` |
| Who uses this screen | Two large choices (`[data-level-btn]`): **Farmer** `Simple view: rooms, harvest and batches.` and **Installer** `Everything, plus the planning tools (Simulate, Calibrate, Test bench) and the control rules.` |
| Look | `Light`, `Dark`, `Same as this device` (`.seg`), stored as 3.1 says. |
| About this app | `This app runs your grow rooms. It keeps each room's temperature, humidity and fresh air where your mushrooms like them, using the aircon, mister and fans. It records your batches of blocks and every crate you harvest.` and, when every room is simulated, `No sensors are connected yet: the rooms run on a computer model.` |
| This device | `Farm server: <location.host>` and the app version from `package.json` is not needed (leave out). |

## 4. Overview `#/overview` (Overview stream; `web/overview.js`, `web/overview.css`)

| Part | Rule |
|---|---|
| Page head | Title `Your farm today`, sub the farm date (`Monday 12 October`, farm time UTC+8), action `a.btn.btn-primary.btn-link` `Record harvest` → `#/harvest`. |
| Getting started | `section.card.ov-start` while not all done and not hidden: a checklist (`ol`, each `li[data-done]` with ✓ or ○, text, and a link): `Add your rooms` (≥ 1 room; → `#/rooms`), `Tell each room what it grows` (every room has more than one settings version, `listSettingsHistory`; → `#/rooms/<first room not done>/settings`), `Add the blocks you bought` (any batch, `listBatches()`; → `#/batches`), `Record your first harvest` (any batch with `totals.kg > 0`; → `#/harvest`), installer only `Calibrate a room after a day of readings` (any room with a calibration, `listCalibrations`; → `#/rooms/<id>/calibrate`). A text button `Hide this list` stores `localStorage['mushroom-farm.start.hidden'] = '1'`. |
| Numbers | `div.ov-kpis` of four `section.card.kpi` tiles, each `span.kpi-label`, `span.kpi-value` (`--fs-2xl`, `--font-num`), `span.kpi-sub`: **Rooms** `2 of 3 OK` / sub `1 to check` or `All good`; **Alarms** count / sub the room names or `None open`; **Energy today** `<kWh> kWh` / sub `about RM <x.xx>` at RM 0.57 per kWh (lead decision 98); **Harvest** `<kg> kg today` / a 7-bar mini chart of the last 7 farm days (sub `<kg> kg this week`). |
| Energy | For each room `getReadings(id, { from: <00:00 farm time>, to: now, step: 3600 })`; the room's kWh today = the sum over consecutive rows of `max(0, kwh[i] − kwh[i−1])` (a meter restart counts as 0); rows with `kwh` null are skipped. |
| Harvest | Today: the sum of `today.kg` over `getRoomHarvest(id)` for every room. Week: the crates of every placed batch (`getBatch(id)`), bucketed by farm day; cleared batches are left out (documented as a limit). |
| Rooms | `div.ov-rooms`, one `article.card.ov-room` per room: name (link to `#/rooms/<id>/overview`), `roomStatus` chip, `Simulated` / `Manual: …` chips, crop · stage · flush; three readings (T, RH, CO₂), each value + `plainChip`; T and RH each with a 24 h sparkline; a machine strip (5 dots with names: on/off from the reading, manual marked); `Harvest today: <kg> kg`; `Record harvest` `a.btn.btn-primary.btn-link` → `#/harvest/<id>`. Cards in a grid `repeat(auto-fill, minmax(300px, 1fr))`. |
| Sparkline | Inline SVG about 140 × 36: the room's band as a filled rect (`--band`; T target ± 1 °C, RH target ± 3 % from `live.targets`), the line (`--trend`, 1.5 px), the last point as a dot; `role="img"` and `aria-label="Temperature, last 24 hours: 24.1 to 25.6 °C"`. From `getReadings(id, { from: now − 86400, to: now, step: 900 })`. Fewer than 2 points: the text `Collecting readings…`. |
| Recent events | `section.card.ov-events`: the 8 newest events over all rooms (`getEvents(id, { limit: 5 })` per room, merged by `t`): time `HH:MM` (farm), room name, text. |
| No rooms | Instead of numbers and rooms: a card `No rooms yet.` with `a.btn.btn-primary.btn-link` `Add a room` → `#/rooms`. |
| Refresh | `listRooms` every 30 s (cards, numbers); readings, energy and sparklines every 5 min; events and harvest every 60 s. Every async reply checks a per-mount token (`const me = ++mountSeq`, bumped in `unmount`), so a late reply never paints into a new mount. All timers cleared in `unmount`. |
| Errors | One `p.alert` under the page head through `say`; a failing part (one room's readings) leaves the rest working. |

## 5. Room page (Room stream)

### 5.1 Rooms list `#/rooms` (`web/rooms.js`)

| Item | Rule |
|---|---|
| Page head | Title `Rooms`, sub `Your grow rooms. Green means all good. Amber or red means go and check.`, action `button.btn.btn-primary` `New room` that opens (and focuses) the New room card; the card is closed by default when rooms exist, open when there are none. The C11 simulated note moves to the Overview and Settings (remove it here). |
| Cards | As C11 5.1, but the chips go through `plainChip` and status through `FarmUi.roomStatus`; the link goes to `#/rooms/<id>/overview`. |

### 5.2 Room frame (`web/rooms.js`)

| Item | Rule |
|---|---|
| Head | `pageHead`: title the room name, sub `<crop> · <stage> · flush <n> · <size> m³`; under it a chip row (state, alarms, `Simulated`, `Manual: …`, feed text); actions `Record harvest` (`a.btn.btn-primary.btn-link` → `#/harvest/<id>`) and `Restart` when stopped. The breadcrumb `Rooms › <name>` stays above the title. |
| Tabs | `Overview`, `Settings`, `Simulate`, `Calibrate`; Simulate and Calibrate links carry `data-level-only="installer"`. |

### 5.3 Overview tab (`web/room-live.js`, registered as `overview`)

What stays from the Live tab: values with chips (through `plainChip`), `Should be:` line, machine tiles, the fresh-air card (heading `Fresh air`, was `Air exchange`), trend charts, alarms, event log. What moves to the Settings tab: the settings section, Save bar, Settings versions, Room details. The leave guard moves with them. No settings are edited on this tab.

### 5.4 Settings tab (`web/room-settings.js`, registered as `settings`)

| Item | Rule |
|---|---|
| Content | The settings panel (`FarmSettingsPanel.createSettingsPanel`, as the Live tab used it, including `getCommand` from the latest reading via `ctx.on('reading')`, the ladder in the rules side slot and the program status slot), Settings versions (`data-level-only="installer"`), Room details (Name, Room size) and a `Danger zone` card with `Archive room` (`.btn-danger`, confirm as before). |
| Save bar | `div.save-bar`, sticky at the bottom of the view while there are unsaved changes: `N unsaved change(s)`, `Save` (primary), `Discard`. The leave guard (C11 3.1) counts settings and Room details changes. Save keeps the existing confirm box with the change lines. |
| Messages | Through `say` / `plainError` / `markFields` as C11. |
| CSS | Only in `web/room.css`. |

## 6. Harvest and Batches (Harvest stream)

| Screen | Rule |
|---|---|
| `#/harvest` (new view `today`) | `pageHead`: title `Harvest`, sub `Today, <farm date>`, action `a.btn.btn-link` `Print QR stickers` → `#/harvest/stickers`. One `section.card.hv-room` per room with placed batches (`listRooms`, then `getRoomHarvest`): room name, crop · flush, `<kg> kg today · <n> crate(s)`, and a big `a.btn.btn-primary.btn-link` `Record harvest` → `#/harvest/<id>`. Then `section.card` `Today's crates`: every crate of today over all rooms, newest first (time, room, mushroom, kg, picker). No placed batch anywhere: `No blocks are growing in a room yet. Add a batch in Batches, then place it in a room.` with a link to `#/batches`. Refresh every 60 s; per-mount token. |
| Stickers | `pageHead` title `QR stickers`, sub `Print one per room and stick it at the door. Scanning it opens the harvest page for that room.` |
| Phone page `#/harvest/:id` | Unchanged (bare layout). |
| Batches `#/batches` | `pageHead`: title `Batches`, sub `The blocks you bought, from arrival to the last flush.`, action `button.btn.btn-primary` `New batch` that opens and focuses the New batch card (closed by default when batches exist, open when none). The `Print QR stickers` button leaves this page (it is on Harvest). Tabs as C11 (`New`, `Growing`, `Finished`) as a `.seg`. An empty tab says `No batches here.` |
| Batch page | `pageHead`: title `<Mushroom>` plus ` · <strain>` only when there is a strain; sub `<state words>` (`New, not in a room yet` / `Growing in <room>` / `Finished`) and `Arrived to placed: <n> day(s)` with the right plural. Actions: `Save changes` stays at the bottom of the form; `Place in room`, `Finish batch`, `Delete` go to the page head's action row. |

## 7. Wording on farmer screens (all streams, in their own files)

| Old | New |
|---|---|
| Air exchange (as a heading or machine name) | Fresh air (tile names keep C11's `Fresh-air fans`) |
| Status chip texts | Through `plainChip` (2.4) |
| `Live` (room tab) | `Overview` |
| `– ` for a missing strain in titles | leave the part out |
| `1 days`, `1 crates` | correct singular |

## 8. Checks for every stream

| Check | How |
|---|---|
| Unit tests | `npm test` passes in the stream's worktree. Pure helpers exported and tested (for example `kwhToday(rows)`, `sparkPath(points, w, h, band)`, `weekBars(crates, now)`, `checklist(state)`, `farmStatus(rooms)`, `harvestRooms(list)`). |
| Headless | Server from the worktree: `FARM_PORT=<port> FARM_DB=/tmp/uxw2/<stream>.db node --disable-warning=ExperimentalWarning server/main.js` (Shell 8101, Overview 8102, Room 8103, Harvest 8104); it listens on the LAN address it prints (for example `http://10.0.1.120:<port>`). Drive it with `/tmp/uxreview/node_modules/playwright-core` and the headless shell `/home/foqcus/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`. Seed data through the API (rooms, a batch placed with crates: `POST /api/batches`, `POST /api/batches/:id/place` `{ room_id }`, `POST /api/batches/:id/crates` `{ kg }`). Screenshot the stream's screens at 1440×900 and 390×844, in light and dark, into `/tmp/uxw2/<stream>/`, and look at them. `scrollWidth ≤ 390` at 390 px. No console errors. Stop **only your own** server, by its PID. |
| Commits | On the stream branch; prefixes and layout are not reviewed. |

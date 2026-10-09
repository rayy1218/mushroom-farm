# Work brief: Bench (`web/simulator.js` room link, `#/simulator/:id`, `calib.js`)

Revision 1, 2026-10-09 (wave 2, written in prep 2.0 from the frozen contracts on `master` e60dabf). Stream: **Bench**. Replaces the wave 2 draft brief `simulator-link.md` (wave 2 plan 8); its sections 5 and 6 are carried over verbatim in sections 5 and 6 below, with the test file renamed `tests/web-room-link.test.js` (finding 26). Implementer on Sonnet; the reviews (spec compliance, then code quality) run on Opus before the lead merges.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–69 (here: 6, 23, 28, 35, 51, 53) | `docs/contracts/LEAD-DECISIONS.md` | They override this brief and every contract text |
| C5 and C6 revision 8 | `docs/contracts/web.md` | 1.4, 2.1 (`#/simulator/:id` → `{ roomId }`), 3.1, 3.5 (`FarmBench` stays until wave 3), 3.11 (what the Calibrate tab shows of `PARAMS.ua`), 4.1–4.3, 4.5, 5, 7.5, 7.6, 7.8 (all rows, with the revision 8 rules, `createRoomLink(deps)`, its members, steps and page wiring, the Node export), 7.10 rows "how wave 2 checks run" and "Test bench" |
| C9 revision 2 | `docs/contracts/air.md` | Section 7 (the Test bench's `#inAirM3h`, `airText`, `mimicLayout`: unchanged and not yours); 8 (`calib.js` column `air`) |
| C3 revision 9 | `docs/contracts/api.md` | 3.5, 3.6 (the `ua` meaning text), 6.1, 6.4, 6.5 |
| Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Sections 3 (Bench row), 3.1, 4, 5, 6.2 (`mimicLayout`), 7, 8 (row `simulator-link.md`), 10 (findings 14, 15, 26) |
| `simulator-link.md` (wave 2 draft, kept as history) | `docs/superpowers/plans/2026-10-08-farm-foundation/simulator-link.md` | Its sections 5 and 6 are quoted below; nothing else of it applies |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/bench.md` | Committed on `master` by the lead in prep 2.0; you do not edit it |

## 1. Goal

| Outcome | Measure |
|---|---|
| The room link | **Load settings from room** and **Save settings to room** with a room picker in the Test bench's "Climate controller" heading row; the logic in `createRoomLink(deps)` (C5 7.8), tested in Node through the Node export |
| `#/simulator/:id` | The shell passes `{ roomId }`; the bench picks that room when listed and runs **Load** for it at once (opened from the Simulate tab's **Open test bench**) |
| The calibration label (lead decision 28) | `ClimateCalib.PARAMS.ua.label` = `Heat through walls and roof (W/K)`, `note` = `Heat flows out when the room is warmer than outside, in when outside is hotter.`; the Test bench event text `Simulation calibrated: heat through walls and roof <ua> W/K, …` |
| `replay` follows the stage (lead decision 23) | `ClimateCalib.replay` sets the blocks' stage from each log row that has a `stage`; rows without one keep `envBase.blockStage` |
| The Node export (lead decision 51) | The last statement inside the wrapper of `web/simulator.js`: `if (typeof module === 'object' && module && module.exports) module.exports = { createRoomLink, airText, mimicLayout };` |
| Nothing else of the bench changes | The mimic and C9's air card code, `FarmBench`, the existing bench, calib and C9 tests stay as they are and green |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/bench` (below `<worktree>`), on branch `stream/bench`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm`. |
| Git | Keep the configured identity (never change `git config`). Plain commit messages such as `feat(bench): …`, `feat(calib): …`, `test(bench): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase; never merge `master` into your branch. |
| Gate 2.5 | Your headless check runs against the real server of the gate 2.5 `master` (wave 2 plan 5): do tasks 0–15, commit, tell the lead you wait for gate 2.5, then run task 16 when the lead says it passed. |
| The room pick | The `{ roomId: 1 }` mount and `#/simulator/1` are the lead's wave 3 check, not yours: the wave 1 `web/shell.js` on the gate 2.5 tree has no `#/simulator/:id` route and no way to reach the registered module before the Room shell merges (C5 7.10 row "Test bench"; wave 2 plan 8, finding 14). You build the rule; you do not check it in a browser |

| Check (from `<worktree>`) | Expected; otherwise stop and report to the lead |
|---|---|
| `git branch --show-current` | `stream/bench` |
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` (C5 1.6) | All three listed |
| `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js web/batches.js web/harvest.js web/harvest.css` (C5 1.7) | All eight listed |
| `grep -c 'web/room-tabs.js' index.html` (C5 1.7) | `1` |
| `grep -n "module.exports" web/simulator.js` | One line: `if (typeof module === 'object' && module && module.exports) module.exports = { airText };` |
| `grep -n "^function mimicLayout\|^function airText\|^function mount" web/simulator.js` | All three present (C9 and wave 1 code on `master`) |
| `grep -n "Room heat loss (W/K)" calib.js` and `grep -n "heat loss \${" web/simulator.js` | One line each (the texts you change) |
| `grep -c safeSettings web/settings-panel.js` | At least `1` (C6 7.6) |
| `npm test` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `K0` |

Read the current `web/simulator.js` first. Its names (`cfg`, `ctl`, `panel`, `onEvent`, `reading`, `scheduleCropCheck`, `paintAirSize`, the ladder redraw `updateLadderLive`, the charts-dirty flag `chartsDirty`, `mount(viewEl)`) may differ slightly from this brief; use what the file has. Also read `calib.js` (`envWith`, `replay`), `tests/calib.test.js` (`makeLog`), `tests/web-air.test.js` (how it requires `web/simulator.js` in Node).

## 3. Owned files (the only files you may touch; wave 2 plan 3, Bench row)

| File | Action | Content |
|---|---|---|
| `web/simulator.js` | Modify | The picker row markup, `mount` / `unmount` wiring, `createRoomLink`, `#/simulator/:id`, the `onLoaded` `airM3h` rule, the calibration event text, the Node export with `createRoomLink` and `mimicLayout`. Not the mimic code (`mimicLayout` and the drawing) and not C9's air exchange card code (lead decision 53) |
| `calib.js` | Modify | `PARAMS.ua` `label` and `note`; `replay` follows a row's `stage` |
| `tests/web-room-link.test.js` | Create | Sections 6.1, 6.2 |
| `tests/calib.test.js` | Append tests only | CA1–CA3 (section 6.2); existing tests unchanged |

| Not yours | Owner |
|---|---|
| `tests/web-bench.test.js`, `tests/web-load.test.js`, `tests/web-mimic.test.js`, `tests/web-air.test.js` (they must stay green) | Nobody in wave 2 (the lead in wave 3) |
| `sim.js` (`blockStage` is read by the simulation; you only set it on the sim's env) | Equipment |
| `web/settings-panel.js`, `web/charts.js`, `web/api.js`, `web/ui.js`, `web/shell.js`, `index.html`, `styles.css` | Equipment (one option), Calibrate tab, lead, Room shell |
| `web/room-calibrate.js` (it shows `PARAMS.ua.note` when it is a string) | Calibrate tab |
| Everything else | Read-only |

| Rule | Detail |
|---|---|
| Inline style | `styles.css` is not yours: the picker row uses an inline style (5.3) |
| Blocked | If something outside your files blocks you, stop that part and report it to the lead |

## 4. What you build against

| Contract | Section | What you take from it |
|---|---|---|
| Lead decisions | 6 | Settings from HTTP never reach `ClimateController.applySettings` as they came: only the `settings` of `safeSettings` (built on `importSettings`) are applied |
| C5 | 7.8 (all rows) | The Test bench's panel use; **Load settings from room**, **Save settings to room**; the revision 7 rules (`#/simulator/:id`, Machines `PLANT` in wave 2, the calibration event text, `PARAMS.ua`, the Node export, the room drawing); `createRoomLink(deps)`: deps, members, the `load` and `save` steps, page wiring (with `params.roomId` and the `airM3h` row of `onLoaded`) |
| C5 | 7.5, 7.6 | `Change` format; `diffSettings`; `safeSettings`; `showChanges` |
| C5 | 1.4, 3.1, 3.5 | Wrapper, no DOM at load, no new global; `mount` / `unmount` rules; `FarmBench` stays exactly as wave 1 left it (with `mimicLayout`) |
| C5 | 2.1 | `#/simulator/:id` → `{ roomId: Number(id) }` (the Room shell's shell passes it from wave 3) |
| C5 | 4.1–4.3, 4.5, 5 | `FarmApi.listRooms`, `getSettings`, `saveSettings`, `ApiError`; `startFakeApi()`; `FarmUi.errorText` |
| C5 | 3.11 | The Calibrate tab shows `PARAMS.ua.label` and `.note` (when a string): your label and note are the only text it shows |
| C5 | 7.10 row "Test bench" | Your Node tests and checks; the room pick is the lead's wave 3 check |
| C9 | 7 | The Test bench's `#inAirM3h` (sets `env.airM3h` and `cfg.airM3h` together); `airText` and `mimicLayout` exist on `master` |

| Lead decision | As it applies to this stream |
|---|---|
| 23 | `calib.js` `replay` follows a row's `stage` (history rows carry it, C5 3.11) |
| 28 | The label `Heat through walls and roof (W/K)`, its note, and the event text `heat through walls and roof <ua> W/K` |
| 35 | The Test bench keeps `PLANT` machines and its own `#inAirM3h` in wave 2: a room's saved Equipment is not loaded, also on `#/simulator/:id` |
| 51 | `mimicLayout` joins the Node export beside `createRoomLink` and `airText`; the lead points `tests/web-mimic.test.js` at it in wave 3 before deleting `FarmBench` |
| 53 | The drawing fix and C9's rewrite are on `master`; no wave 2 stream changes the mimic code |

## 5. What to build

### 5.0 Changes to the quoted sections (C5 revision 8 wins over the quoted text)

Sections 5.1–5.3 and 6.1 quote `simulator-link.md` sections 5 and 6 verbatim, with only the test file name changed. These rows amend them; where a quoted line and a row below differ, the row (C5 7.8 revision 8) wins.

| # | Quoted place | Amendment |
|---|---|---|
| A1 | 5.1, the Node export line `module.exports = { createRoomLink }` | The export is `module.exports = { createRoomLink, airText, mimicLayout };` (C5 7.8, lead decision 51), still the last statement inside the wrapper; it adds no browser global |
| A2 | 5.3 row "`listRooms` resolves rooms" | Select `params.roomId` when listed (`#/simulator/:id`), else the id kept from the last mount if listed, else the first. With `params.roomId` listed, run **Load** for it at once (the change list shows first, as **Load**) (C5 7.8) |
| A3 | 5.3 row "`onLoaded(changes)`" | Also: if a change has path `airM3h`: `env.airM3h = cfg.airM3h`, `#inAirM3h` shows it (and the bench's own air size repaint, `paintAirSize()` on `master`) (C5 7.8, C9 7) |
| A4 | 5.3 row "`mount`" | `mount(viewEl, params)` receives the shell's params (`{}` or `{ roomId }`); the rest of `mount` stays |
| A5 | 6.1 row "Requires, in order" | `../sim.js`, `../air.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../web/ui.js`, `../web/api.js`, `../web/charts.js`, `../web/settings-panel.js` (C9 added `air.js`: the controller reads `ClimateAir` at call time); then `globalThis.FarmShell = { register() {} }`; then `const { createRoomLink, airText, mimicLayout } = require('../web/simulator.js')` and `const { startFakeApi } = require('./fakes/api-server.js')` |
| A6 | 6.1 task 12 and the quoted "7.2" | The headless check is section 7.2 of this brief (on the gate 2.5 check tree, navigating to `#/rooms` where the quoted text says `#/calibration`) |
| A7 | 6.1 task 13 and "Section 8" | Section 7.1 of this brief and its report (section 10) |
| A8 | 6.1 row "Room" | The "different" room settings also set `airM3h = 900` for RL2 (6.2); L1–C4 are unchanged by it |

### 5.1 `createRoomLink(deps)` (inside `web/simulator.js`) — quoted from `simulator-link.md` 5.1

The logic of the two actions, without DOM. Export it for Node only, as the last statement inside the wrapper (adds no browser global):

```js
if (typeof module === 'object' && module && module.exports) module.exports = { createRoomLink };
```

If the wave 1 file touches `window`, `document` or `matchMedia` at load, move that into `mount` or the lazily created Simulator state (C5 1.4).

| Dep | Type | Page value |
|---|---|---|
| `api` | `{ getSettings, saveSettings }` as C5 4.3 | `FarmApi` |
| `diffSettings` | `(base, next) → Change[]` | `FarmSettingsPanel.diffSettings` |
| `safeSettings` | `(settings) → { settings, warnings }` | `FarmSettingsPanel.safeSettings` |
| `showChanges` | `(changes, { title, confirmText, note }) → Promise<string \| null>` | The wrapper of 5.3 |
| `errorText` | `(err) → string` | `FarmUi.errorText` |
| `cfg` | Settings | The live object the Simulator's controller runs with; never replaced |
| `getCtl` | `() → controller` | `() => ctl` (**Reset** makes a new controller on the same `cfg`) |
| `event` | `(text) → void` | Adds an `info` event to the Simulator log: `onEvent({ t: reading ? reading.t : 0, lvl: 'info', text })` |
| `onLoaded` | `(changes) → void` | Repaint after a confirmed load (5.3) |

| Member | Signature | Contract |
|---|---|---|
| `load` | `(room: { id, name }) → Promise<string \| null>` | Steps in 5.2. A string is the message-line text (`''` clears it). `null` = change nothing (disposed, or another action running). Never rejects. |
| `save` | same | Steps in 5.2 |
| `busy` | getter → boolean | `true` from the start of `load` or `save` until it settles |
| `dispose` | `() → void` | Later `load` / `save` resolve `null` with no request. A call in flight resolves `null` and from then on touches nothing (`cfg`, controller, `event`, `onLoaded`, no `saveSettings`). Idempotent. |

### 5.2 Steps (`<room>` = `room.name`) — quoted from `simulator-link.md` 5.2

**`load(room)`**

| Step | Action |
|---|---|
| 1 | Disposed or `busy`: resolve `null`, no request. Else `busy = true`. |
| 2 | `raw = await api.getSettings(room.id)`. Disposed: `null`. |
| 3 | `roomSettings = safeSettings(raw).settings`. A throw: resolve `The settings of <room> could not be read: <err.message>` (nothing changed). |
| 4 | `changes = diffSettings(cfg, roomSettings)`. Empty: resolve `Same settings as <room>.` |
| 5 | `answer = await showChanges(changes, { title: 'Load the settings of <room>?', confirmText: 'Load', note: false })`. Disposed: `null`. `answer === null`: resolve `''`. |
| 6 | `ClimateController.applySettings(cfg, roomSettings)`; `getCtl().cancelRamp()`; `event('Settings loaded from room "<room>"')`; `onLoaded(changes)`; resolve `Loaded the settings of <room>.` |
| Error | Disposed: `null`. Else resolve `errorText(err)`; an error that is not a `FarmApi.ApiError` is also logged with `console.error`. |
| Always | `busy = false` in `finally`. |

**`save(room)`**

| Step | Action |
|---|---|
| 1 | As `load`. |
| 2 | `base = await api.getSettings(room.id)`. Disposed: `null`. |
| 3 | `sent = structuredClone(cfg)`; `changes = diffSettings(base, sent)`. Empty: resolve `<room> already has these settings.` |
| 4 | `note = await showChanges(changes, { title: 'Save these settings to <room>?', confirmText: 'Save to room', note: true })`. Disposed: `null`. `note === null`: resolve `''` (no `PUT`). |
| 5 | `{ warnings } = await api.saveSettings(room.id, sent, note \|\| 'From the Simulator')`. Disposed: `null`. |
| 6 | No warnings: `Saved.`; else `Saved with <n> warning(s): <warnings joined with ' '>`. The reply's `settings` are not copied into `cfg`. |
| Error, Always | As `load`. |

`sent` is taken once, before the dialog, so the server gets exactly what the user confirmed even if the simulation changes `cfg` while the dialog is open.

### 5.3 Page wiring (`mount` and `unmount`) — quoted from `simulator-link.md` 5.3

Add to the template, inside the `div.section-head` of the "Climate controller" heading, after its `<p>` (inline style: `styles.css` is not yours):

```html
<div style="margin-left:auto;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px">
  <label for="simRoom">Room</label>
  <select id="simRoom" disabled></select>
  <button class="btn" id="simRoomLoad" disabled>Load settings from room</button>
  <button class="btn" id="simRoomSave" disabled>Save settings to room</button>
  <span class="tag" id="simRoomMsg" role="status" aria-live="polite"></span>
</div>
```

| Moment | Action |
|---|---|
| `mount` | `link = createRoomLink({ api: FarmApi, diffSettings, safeSettings, showChanges: <wrapper>, errorText: FarmUi.errorText, cfg, getCtl: () => ctl, event, onLoaded })`; then `FarmApi.listRooms()` (once per mount; no stream, no polling) |
| `listRooms` resolves rooms | One `option` per room: `value = String(room.id)`, `option.textContent = room.name` (never `innerHTML`). Select the id kept from the last mount if listed, else the first. Enable the select and both buttons; clear the message. |
| `listRooms` resolves `[]` | All three stay disabled; message `No rooms on the farm server. Create one under Rooms.` |
| `listRooms` rejects | All three stay disabled; message `FarmUi.errorText(err)`; the bench keeps running |
| Settles after `unmount` | Ignored (mount token; no DOM access) |
| `simRoom` change | Keep the picked id in the module closure (survives remounts); clear the message |
| Button click | `room` = the listed Room with the picked id. Disable the three. `text = await link.load(room)` (or `save`). `text !== null`: message = `text`, enable the three. `null`: do nothing. |
| `onLoaded(changes)` | `panel.set(cfg)`; if a change has path `farmType`, `crop` or `stage`: `scheduleCropCheck()`; redraw the ladder and mark the charts dirty (as C6 7.8 "After every `onChange`") |
| `showChanges` wrapper | `(c, o) => { const p = FarmSettingsPanel.showChanges(c, o); const d = document.body.lastElementChild; openDialog = d && d.tagName === 'DIALOG' ? d : null; return p; }` |
| `unmount` | `link.dispose()`; if `openDialog` is still in the document: `openDialog.close()`, `openDialog.remove()`; `openDialog = null`. Everything else `unmount` does stays. |

### 5.4 The other Bench changes (C5 7.8 revision 7 and 8 rules)

| Item | Rule |
|---|---|
| Calibration event text (`FarmBench.applyCalib`) | `` `Simulation calibrated: heat through walls and roof ${params.ua.toFixed(0)} W/K, leakage ${params.infAch.toFixed(2)}/h, moisture buffer ${params.moistBuffer.toFixed(1)}, CO₂ ${env.co2PerBlock} mL/h per block` `` (only `heat loss` changes; lead decision 28) |
| `ClimateCalib.PARAMS.ua` | `{ label: 'Heat through walls and roof (W/K)', note: 'Heat flows out when the room is warmer than outside, in when outside is hotter.', min: 20, max: 400, where: 'room' }` (the other three `PARAMS` unchanged, no `note` on them) |
| `replay` and `stage` | Inside `replay`, a row's `stage` counts when it is an own key of `ClimateSim.PLANT.blockStage`; at the moment the loop takes that row's command (`cmd = cmdOf(r)`), it also sets `sim.env.blockStage = r.stage` (`sim.env` is the env object the simulation steps with, `sim.js` `create` returns it). Rows without such a `stage` (CSV rows, readings before upgrade 3) leave it as it is, so a log without stages replays exactly as today (CA3) |
| Machines | No change: the bench simulates `PLANT` machines, also on `#/simulator/:id` (lead decision 35); its air size is its own `#inAirM3h` |
| Not changed | `mimicLayout` and the drawing, C9's air card (`airText`, the status card, glance row, ladder, `drawPurgeBars`), `FarmBench` and its members, every other bench feature |

## 6. Tasks (TDD: write the test, see it fail, then implement)

### 6.1 Room link tasks — quoted from `simulator-link.md` 6 (test file renamed; amendments A5–A8 apply)

All Node tests go in `tests/web-room-link.test.js`.

| Setup item | Value |
|---|---|
| Requires, in order | `../sim.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../web/ui.js`, `../web/api.js`, `../web/charts.js`, `../web/settings-panel.js`; then `globalThis.FarmShell = { register() {} }`; then `const { createRoomLink } = require('../web/simulator.js')` and `const { startFakeApi } = require('./fakes/api-server.js')` |
| Per test | `fake = await startFakeApi()`; `FarmApi.base = fake.url`; `await fake.close()` after. `cfg = ClimateController.defaultSettings()`; `ctl = ClimateController.create(cfg, null, null)`; `events = []`; `loaded = []`; a `showChanges` stub that records `(changes, opts)` and returns a Promise the test resolves |
| Deps | `api: FarmApi`, `diffSettings` and `safeSettings` from `FarmSettingsPanel`, `errorText: FarmUi.errorText`, `cfg`, `getCtl: () => ctl`, `event: t => events.push(t)`, `onLoaded: c => loaded.push(c)` |
| Room | `{ id: 1, name: 'Room 1' }`. "Different" room settings: `defaultSettings()` with `spRH = 85` and `crop = 'pink'`, served with `fake.reply('GET', '/api/rooms/1/settings', 200, roomSettings)` |
| API requests | Read only entries of `fake.requests` whose `path` starts with `/api/` |

| # | Test(s) first | What it proves |
|---|---|---|
| 1 | **T1** the requires succeed; `typeof createRoomLink === 'function'`; `globalThis.FarmBench` exists | No DOM at load; Node export; `FarmBench` kept |
| 2 | **L1** reply `structuredClone(cfg)` → `Same settings as Room 1.`; exactly one `GET /api/rooms/1/settings`; stub not called; `events` empty | No dialog for an empty list |
| 3 | **L2** different settings, stub resolves `null` → `''`; stub got `diffSettings(<copy of cfg before>, roomSettings)` and exactly `{ title: 'Load the settings of Room 1?', confirmText: 'Load', note: false }`; `cfg` deep-equals the copy; `events`, `loaded` empty | Cancel changes nothing; exact options; direction Simulator → room |
| 4 | **L3** `cfg.program.rampH = 4`, `ctl.setStage('pinning', 0)` (a ramp runs), `ref = cfg`; different settings; stub resolves `''` → `Loaded the settings of Room 1.`; `diffSettings(cfg, roomSettings)` is `[]`; `cfg === ref`, `ctl.cfg === cfg`; `ctl.state.stage.ramp === null`; `events` = `['Settings loaded from room "Room 1"']`; `loaded` = one entry equal to the stub's changes | Copied into the same object; ramp cancelled; event; `onLoaded` once |
| 5 | **L4** reply = `Object.assign(JSON.parse('{"__proto__":{"polluted":1}}'), roomSettings, { bogus: 1, spT: 99 })`; stub resolves `''` → after load `({}).polluted === undefined`, `'bogus' in cfg === false`, `cfg.spT === 35`; no change path in the stub's list is `bogus` or starts with `__proto__`. **L5** reply body `5` → resolves a string starting `The settings of Room 1 could not be read: `; stub not called; `cfg` unchanged | Lead decision 6: the reply goes through `safeSettings` before the diff and `applySettings` |
| 6 | **L6** `fake.reply('GET', '/api/rooms/1/settings', 404, { error: 'Unknown room', details: [] })` → `Unknown room`; stub not called; `cfg` unchanged. **L7** fake closed first → a string starting `The farm server cannot be reached.`; `busy === false` after | `ApiError` becomes the message; link stays usable |
| 7 | **S1** reply `structuredClone(cfg)` → `Room 1 already has these settings.`; no `PUT`. **S2** different settings, stub resolves `null` → `''`; stub got `diffSettings(roomSettings, <copy of cfg>)` and exactly `{ title: 'Save these settings to Room 1?', confirmText: 'Save to room', note: true }`; no `PUT` | Direction room → Simulator; exact options; no request on cancel |
| 8 | **S3** stub resolves `'Lower RH'`; `fake.reply('PUT', '/api/rooms/1/settings', 200, { settings: { ...roomSettings, spT: 20 }, warnings: [] })` → `Saved.`; `PUT` body deep-equals `{ settings: <copy of cfg>, note: 'Lower RH' }`; `cfg.spT` unchanged. **S4** stub resolves `''` → body `note` is `'From the Simulator'`. **S5** reply `warnings: ['A.', 'B.']` → `Saved with 2 warning(s): A. B.` | Bare Settings and note sent; default note; warning text; reply not applied |
| 9 | **S6** the stub sets `cfg.spT = 30` before resolving `'x'` → `PUT` body `settings.spT` is the value before the dialog. **S7** `PUT` reply 400 `{ error: 'Invalid settings', details: ['note must be text of at most 200 characters'] }` → `Invalid settings: note must be text of at most 200 characters` | What is sent is what was shown; a 400 is shown, not thrown |
| 10 | **C1** `load` pending on the stub: a second `load` and a `save` each resolve `null`, no new request; `busy === true`. **C2** different settings, `dispose()` while the stub is pending, then stub resolves `''` → `null`; `cfg` unchanged; `events`, `loaded` empty. **C3** same for `save` with `'x'` → `null`; no `PUT`. **C4** after `dispose()`, `load` and `save` resolve `null` with no request | One action at a time; nothing after `unmount` |
| 11 | No Node test (DOM): build 5.3 | Checked in task 12 |
| 12 | Headless Chrome check (7.2) | C5 7.10 "Simulator link" |
| 13 | Run 7.1, commit, report | Section 8 |

### 6.2 Bench tasks (this brief; run after task 10 of 6.1, before its tasks 11–13, which this brief runs as tasks 14–16)

| # | Test(s) first | Then build | What it proves |
|---|---|---|---|
| 0 | – | Section 2 checks; read the files listed there. No commit | The start state |
| 1–10 | 6.1 tasks 1–10 (T1, L1–L7, S1–S7, C1–C4) in `tests/web-room-link.test.js`, with the requires of A5 | `createRoomLink` (5.1, 5.2) | C5 7.8 |
| 11 | **RL1 Node export**: `Object.keys(require('../web/simulator.js')).sort()` deep-equals `['airText', 'createRoomLink', 'mimicLayout']`; `mimicLayout === FarmBench.mimicLayout`; `mimicLayout({ inletAt: 'high', exhaustAt: 'low' }).inlet.tag === 'SF-203'` | The export of A1 | C5 7.8 row "Node export", lead decision 51 |
| 12 | **RL2 air size on Load**: room settings = the different settings with `airM3h = 900`; stub resolves `''` → `cfg.airM3h === 900`; the stub's changes and `loaded[0]` hold one change with `path` `airM3h`, `old` 1800, `new` 900. **RL3 event text**: `web/simulator.js` read as text contains `Simulation calibrated: heat through walls and roof ${` and no `heat loss ${` | `onLoaded` `airM3h` row (A3, DOM part checked in 7.2); the event text (5.4) | C5 7.8, C9 7, lead decision 28 |
| 13 | `tests/calib.test.js` (append; its `makeLog`) **CA1 label**: `CAL.PARAMS.ua.label === 'Heat through walls and roof (W/K)'`; `CAL.PARAMS.ua.note === 'Heat flows out when the room is warmer than outside, in when outside is hotter.'` (it contains `outside is hotter`); `min` 20, `max` 400, `where` `room` unchanged; `infAch`, `moistBuffer`, `co2PerBlock` have no `note`. **CA2 replay follows the stage**: `const { rows } = makeLog({ ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 }, 2); const staged = rows.map((r, i) => ({ ...r, air: 0, stage: i < rows.length / 2 ? 'fruiting' : 'rest' })); const plain = staged.map(({ stage, ...r }) => r); const base = structuredClone(SIM.DEFAULT_ENV), p = CAL.paramsOf(base); const a = CAL.replay(staged, base, p).series, b = CAL.replay(plain, base, p).series;` → the first half deep-equal (`a.slice(0, half)` vs `b.slice(0, half)`), and the last point's CO₂ lower with the stage: `a.at(-1).CO2 < b.at(-1).CO2 − 20` (rest blocks make 0.6 of the CO₂, `sim.js` `PLANT.blockStage`; the air exchange is held off). **CA3 no stage, no change**: `CAL.replay(rows.map(r => ({ ...r, stage: null })), base, p)` deep-equals `CAL.replay(rows, base, p)`; an unknown `stage: 'x'` also changes nothing | `PARAMS.ua`; `replay` (5.4) | Lead decisions 23, 28; C5 7.8, 3.11 |
| 14 | No Node test (DOM) | 5.3 with A2–A4 (the picker row, `params.roomId`, the `airM3h` repaint), the event text | Task 16 |
| 15 | – | `npm test`; commit; tell the lead you wait for gate 2.5 | – |
| 16 | Headless Chrome (7.2), after gate 2.5 | Fix what it finds; a Node test first for any logic bug | C5 7.10 row "Test bench" |
| 17 | – | Section 7.1; commit; report (section 10) | – |

| Point | Rule |
|---|---|
| Test names | Start each test with its id (`test('L3 load copies into the same cfg and cancels the ramp', …)`). One `test(…)` per id: T1, L1–L7, S1–S7, C1–C4, RL1–RL3 in `tests/web-room-link.test.js` (22); CA1–CA3 in `tests/calib.test.js` (3) |
| Existing tests | `tests/web-bench.test.js`, `tests/web-air.test.js`, `tests/web-mimic.test.js`, `tests/web-load.test.js` and the existing `tests/calib.test.js` tests pass unchanged |

## 7. How to verify

### 7.1 Commands (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check web/simulator.js && node --check calib.js` | No output, exit 0 |
| `node --disable-warning=ExperimentalWarning --test tests/web-room-link.test.js tests/calib.test.js tests/web-bench.test.js tests/web-air.test.js tests/web-mimic.test.js tests/web-load.test.js` | `# fail 0` |
| `npm test` | `# fail 0`; `# pass` = `N0` + 25; `# skipped` = `K0` |
| `npm test 2>&1 \| grep -c '^ok .* - vectors: '` | The same count as at the start (`calib.js` is not in the vectors) |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `calib.js`, `tests/calib.test.js`, `tests/web-room-link.test.js`, `web/simulator.js` |
| `git diff $(git merge-base HEAD master) -- tests/calib.test.js \| grep '^-' \| grep -v '^---'` | No output (append only) |
| `git diff $(git merge-base HEAD master) -- web/simulator.js \| grep -n "mimicLayout\|function airText\|fanIn\|fanOut\|drawPurgeBars"` | Only the export line (no change to the drawing or C9's air card) |
| `node -e "for (const f of ['sim','air','controller','runtime','calib']) require('./'+f+'.js'); for (const f of ['ui','api','charts','settings-panel']) require('./web/'+f+'.js'); globalThis.FarmShell={register(){}}; console.log(Object.keys(require('./web/simulator.js')).sort().join(','))"` | `airText,createRoomLink,mimicLayout` |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git status --short` | Empty |

### 7.2 Headless Chrome, after gate 2.5 (C5 7.10 rows "how wave 2 checks run" and "Test bench")

Run only when the lead says gate 2.5 passed. Drive Chrome with the chrome-devtools MCP tools or with `cdp.js` of `web-split.md` Appendix A, copied into a scratch folder made with `mktemp -d`. On this tree the shell is wave 1's: `#/simulator` routes, `#/simulator/1` does not (the room pick is the lead's wave 3 check). Seed and read data with `fetch` or `FarmApi` in the page.

| Step | Shell |
|---|---|
| Check tree | `T=$(mktemp -d); git -C <worktree> archive master \| tar -x -C $T; MB=$(git -C <worktree> merge-base HEAD master); git -C <worktree> archive HEAD -- $(git -C <worktree> diff --name-only $MB HEAD) \| tar -x -C $T` |
| Server (background) | `PORT=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"); cd $T && FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$T/check.db npm start`; the empty database gets `Room 1` |

| # | Step | Expected |
|---|---|---|
| B1 | Open `http://127.0.0.1:<PORT>/#/simulator` | `simRoom` lists `Room 1`; both buttons enabled; `simRoomMsg` empty; the clock advances; no console errors |
| B2 | Click **Pause** (so `cfg` cannot change on its own). Seed: `S = await FarmApi.getSettings(1)`; `await FarmApi.saveSettings(1, { ...S, spRH: 85, airM3h: 900 }, 'seed')`. Click **Load settings from room** | Dialog `Load the settings of Room 1?` with the lines `Humidity target: <old> → 85 %` and `Air exchange size: 1800 m³/h → 900 m³/h`, **Load**, **Cancel**, no note field |
| B3 | Click **Load** | Dialog closes; `inSpRH` shows 85; `#inAirM3h` shows 900 and `__climate.env.airM3h === 900`, `__climate.cfg.airM3h === 900`; the event log shows `Settings loaded from room "Room 1"`; `simRoomMsg` = `Loaded the settings of Room 1.` |
| B4 | Click **Load settings from room** | No dialog; `simRoomMsg` = `Same settings as Room 1.` |
| B5 | Set **Mushroom** (`inCrop`) to Pink oyster; click **Save settings to room** | Dialog `Save these settings to Room 1?` listing `Mushroom: Grey oyster → Pink oyster`, a note field, **Save to room**, **Cancel** |
| B6 | Press Escape | `GET /api/rooms/1/settings/history` unchanged; `simRoomMsg` empty |
| B7 | Click **Save settings to room**, type `headless`, click **Save to room** | `simRoomMsg` = `Saved.` or `Saved with <n> warning(s): …`; `GET /api/rooms/1/settings` has `crop: 'pink'`; the newest history row has `note: 'headless'` |
| B8 | Click **Save settings to room**; with the dialog open run `location.hash = '#/rooms'` | No `dialog` element left; no new history row; no console errors |
| B9 | Back to `#/simulator`; resume the run | `Room 1` still picked; the run continues from where it was |
| B10 | `FarmBench.applyCalib({ ua: 100, infAch: 0.5, moistBuffer: 3, co2PerBlock: 60 }, { T: 0, RH: 0, CO2: 0 })` while mounted | The event log's top row starts `Simulation calibrated: heat through walls and roof 100 W/K, leakage 0.50/h`; `ClimateCalib.PARAMS.ua.label === 'Heat through walls and roof (W/K)'` and `ClimateCalib.PARAMS.ua.note` contains `outside is hotter` |
| B11 | Stop the server; go to `#/rooms`, then `#/simulator` | `simRoom` and both buttons disabled; `simRoomMsg` starts with `The farm server cannot be reached.`; the clock advances; no uncaught errors (the failed fetch may log a network error) |
| End | `rm -rf $T` and the scratch folder | – |

Record each row's result in your report.

## 8. Done when

| # | Item |
|---|---|
| 1 | Every start check of section 2 held (or the lead answered) |
| 2 | `web/simulator.js` has `createRoomLink` (5.1, 5.2), the wiring of 5.3 with A2–A4, the event text of 5.4, and the Node export `{ createRoomLink, airText, mimicLayout }` as the last statement inside the wrapper |
| 3 | **Load** passes the reply through `safeSettings` before any diff or `applySettings` (L4, L5); a loaded `airM3h` reaches `env.airM3h` and `#inAirM3h` (RL2, B3) |
| 4 | `calib.js` has the `ua` label and note and `replay` follows a row's `stage` (CA1–CA3); a log without stages replays as before |
| 5 | `FarmBench`, the mimic, C9's air card and every wave 1 Simulator feature work as before; the existing bench, calib, air, mimic and load tests pass unchanged |
| 6 | `npm test` `# fail 0` at `N0` + 25, `# skipped` `K0`; only the four owned files differ from the merge base |
| 7 | Headless rows B1–B11 passed after gate 2.5, with no console error except the expected network error of B11 |
| 8 | Texts exactly: `Same settings as <room>.`, `Load the settings of <room>?`, `Load`, `Settings loaded from room "<room>"`, `Loaded the settings of <room>.`, `The settings of <room> could not be read: <message>`, `<room> already has these settings.`, `Save these settings to <room>?`, `Save to room`, `From the Simulator`, `Saved.`, `Saved with <n> warning(s): …`, `No rooms on the farm server. Create one under Rooms.`, `Heat through walls and roof (W/K)`, `Heat flows out when the room is warmer than outside, in when outside is hotter.`, `Simulation calibrated: heat through walls and roof <ua> W/K, …` |
| 9 | Committed on `stream/bench` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 3 (`tests/web-bench.test.js`, `tests/web-mimic.test.js`, `sim.js` included) | File owners; the lead moves the mimic test in wave 3 |
| Change `mimicLayout`, the room drawing or C9's air exchange card code | Lead decision 53 |
| Load a room's saved Equipment into the bench | Lead decision 35: the Test bench keeps `PLANT` and its own `#inAirM3h` in wave 2 |
| Pass the `getSettings` reply to `applySettings` without `safeSettings`, or write your own sanitising | Lead decision 6; C6 7.6 owns `safeSettings` |
| Replace `cfg` with a new object | The controller holds it by reference; use `ClimateController.applySettings(cfg, roomSettings)` |
| Call `ctl.setStage`, `setCrop` or `setFarmType` on Load | They start a ramp that overwrites the loaded targets; C6 7.8 says only `cancelRamp()` |
| Copy the `PUT` reply's `settings` into `cfg`; send the file wrapper | C6 7.8; C3 3.5 |
| Open `FarmApi.stream`, poll, retry, or add time-outs | The Test bench does not follow live rooms; C5 4.1 has no retries |
| Add a browser global, or change `FarmBench` | C5 1.4, 3.5 |
| Change `replay` for rows without a `stage`, or any other `calib.js` behaviour | CA3; the existing calib tests |
| Put a room name or server text into `innerHTML` | C5 1.4 |
| Check the `{ roomId: 1 }` mount or `#/simulator/1` in a browser and report it as yours | The lead's wave 3 check (C5 7.10) |
| Push, merge, rebase, merge `master` into your branch, or change git config | The lead merges after review |

## 10. Report to the lead

| Item | Content |
|---|---|
| Result | Done or blocked; `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | `N0`, `K0`, the final `npm test` counts |
| Headless | One line per row B1–B11: pass or fail, with what you saw |
| Points to confirm | (1) the `stage` rule of `replay` (own keys of `PLANT.blockStage`, set on `sim.env` with the row's command); (2) the source check of RL3 for the event text (`FarmBench` exposes no event list in Node); (3) the decisions carried over from `simulator-link.md` section 10 (the save snapshot, the extra texts, the dialog clean-up, `safeSettings` warnings not shown on Load, a stored version that differs from the sent one not shown) |
| Anything else | Every contract gap or mismatch you met, and what you did instead of guessing |

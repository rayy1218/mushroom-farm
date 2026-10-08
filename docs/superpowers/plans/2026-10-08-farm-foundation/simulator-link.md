# Work brief: Wave 2, Simulator link (`web/simulator.js`)

Date: 2026-10-08. Stream: **Simulator link**. Wave: 2. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md` (sections 4, 5, 6). Binding: `LEAD-DECISIONS.md` (it overrides any contract text). You are the implementer; reviewers check the work before the lead merges.

## 1. Goal

Add two actions, with a room picker, to the "Climate controller" heading row of the Simulator module:

| Action | Result |
|---|---|
| **Load settings from room** | Reads the picked room's settings, passes them through `FarmSettingsPanel.safeSettings` (lead decision 6), shows the change list (Simulator → room), and on confirm copies them into the Simulator's running settings object |
| **Save settings to room** | Reads the room's settings, shows the change list (room → Simulator) with a note field, and on confirm stores the Simulator's settings as a new version of the room (`PUT /api/rooms/:id/settings`), then shows the server's warnings or `Saved.` |

The rest of the bench works as before, also when the farm server cannot be reached.

## 2. Before you start

You work alone in your own git worktree, branched from `master` after the wave 1 merge and the lead's wave 1.5 gate (C3 section 2.3). `<worktree>` below is its absolute path.

| Check | Expected; otherwise stop and report to the lead (never write a stand-in) |
|---|---|
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` | All three listed (C5 section 1.6) |
| `ls docs/contracts/api.md docs/contracts/rooms.md docs/contracts/web.md LEAD-DECISIONS.md` | All listed (the lead decisions may sit in `docs/contracts/`; use whichever path the lead committed) |
| `ls web/simulator.js web/api.js web/ui.js web/charts.js web/settings-panel.js web/shell.js server/main.js` | All listed (wave 1 code) |
| `grep -c safeSettings web/settings-panel.js` | At least 1 (C6 7.6) |
| `npm test` | `fail 0`. Write down the pass count (the baseline). |

Read the current `web/simulator.js` first. Its names (`cfg`, `ctl`, `panel`, `onEvent`, `reading`, `scheduleCropCheck`, the ladder redraw, the charts-dirty flag) may differ slightly from this brief; use what the file has.

Git: keep the configured identity (never change `git config`). Small commits (`feat(simulator-link): …`, `test(simulator-link): …`). Do not push, merge or rebase.

## 3. Owned files (the only files you may touch)

| File | Action | Content |
|---|---|---|
| `web/simulator.js` | Modify | Picker row markup, mount and unmount wiring, the `createRoomLink` factory and its Node export (section 5) |
| `tests/simulator-link.test.js` | Create | Node tests of `createRoomLink` against the fake API server (section 6) |

Everything else is read-only, in particular `web/settings-panel.js`, `web/api.js`, `web/ui.js`, `web/shell.js`, `index.html`, `styles.css`, `room-rules.js`, `server/*`, `controller.js`, `sim.js`, `runtime.js`, `calib.js`, `capacity.js`, `tests/fakes/*`, `tests/vectors/*`, every existing test, `package.json` and `docs/*`. Headless check scripts live in `/tmp` and are never committed. If something outside your files blocks you, stop that part and report it.

## 4. Contracts you build against

| Contract | Section | What you take from it |
|---|---|---|
| Lead decisions | 6 | Settings from HTTP never reach `ClimateController.applySettings` as they came: only the `settings` of `safeSettings` (built on `importSettings`) are applied |
| C6 (`docs/contracts/web.md`) | 7.8, rows **Load settings from room** and **Save settings to room** and the paragraph after them | The two flows, their texts, picker placement, the server-down rule (section 5 restates them) |
| C6 | 7.5, 7.6 | `Change` format; `diffSettings(base, next)`; `safeSettings(settings) → { settings, warnings }` (throws when `settings` is not an object); `showChanges(changes, { title, confirmText, note }) → Promise<string \| null>` (resolves the trimmed note, `''` when empty or without a note field; `null` on Cancel or Escape; appends its `<dialog>` to `document.body`; never call it with an empty list) |
| C5 | 1.4 | Wrapper, no DOM at load, markup as a template string, dynamic text only through `textContent`, no new global |
| C5 | 3.1, 3.5 | `mount` / `unmount` rules (unmount stops dialogs; late async results never touch the DOM; API errors shown with `FarmUi.errorText(err)`, module stays usable); `FarmBench` stays exactly as wave 1 left it |
| C5 | 4.1–4.3 | `FarmApi.listRooms()`, `getSettings(id)`, `saveSettings(id, settings, note)`; `FarmApi.ApiError` (`status`, `error`, `details`; status `0` = `The farm server cannot be reached.`) |
| C5 | 4.5 | `startFakeApi()` from `tests/fakes/api-server.js`: `url`, `requests` (`{ method, path, query, body }`), `reply(method, path, status, body)`, `close()` |
| C5 | 5, 7.10 | `FarmUi.errorText`; the "Simulator link" headless check and how wave 2 checks run (real server) |
| C3 (`docs/contracts/api.md`) | 3.5, 6.1, 6.4, 6.5 | `GET /api/rooms` (not archived); `GET /api/rooms/:id/settings` (bare Settings); `PUT` with `{ settings, note? }` → `{ settings, warnings }`; 404 `Unknown room`; 400 `Invalid settings` |
| C2 (`docs/contracts/rooms.md`) | 9.1, 9.2 | Background only: the server may store a version that differs from what was sent (live targets, ramps). You do not handle it. |
| `controller.js` | – | `ClimateController.applySettings(target, src)` copies into the same object; `ctl.cancelRamp()`; `ctl.cfg` is the same object as `cfg` |

## 5. What to build

### 5.1 `createRoomLink(deps)` (inside `web/simulator.js`)

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

### 5.2 Steps (`<room>` = `room.name`)

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

### 5.3 Page wiring (`mount` and `unmount`)

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

## 6. Tasks (TDD: write the test, see it fail, then implement)

All Node tests go in `tests/simulator-link.test.js`.

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

## 7. How to verify

### 7.1 Commands (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check web/simulator.js` | No output, exit 0 |
| `node --test tests/simulator-link.test.js` | T1, L1–L7, S1–S7, C1–C4 pass; `fail 0` |
| `npm test` | `# fail 0`; `# pass` = baseline + the new tests |
| `npm test 2>&1 \| grep -c '^ok .* - vectors: '` | `8` (the 8 recorded runs pass; piped output is TAP) |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `tests/simulator-link.test.js` and `web/simulator.js` |
| `git diff --exit-code $(git merge-base HEAD master) -- tests/vectors controller.js sim.js runtime.js` | No output, exit 0 |

### 7.2 Headless Chrome check (C5 7.10, real server)

Start in the background: `FARM_HOST=127.0.0.1 FARM_PORT=<free port> FARM_DB=$(mktemp -d)/farm.db npm start`. The empty database gets the demo room `Room 1`. Open `http://127.0.0.1:<port>/#/simulator` in headless Chrome (Chrome DevTools tools, or a script driving `--remote-debugging-port`; no new npm packages). Seed and read data with `fetch` in the page.

| # | Step | Expected |
|---|---|---|
| 1 | Open `#/simulator` | `simRoom` lists `Room 1`; both buttons enabled; `simRoomMsg` empty; the clock advances; no console errors |
| 2 | Click **Pause** (so `cfg` cannot change on its own). Seed: `GET /api/rooms/1/settings`, set `spRH = 85`, `PUT` it with `note: 'seed'`. Click **Load settings from room**. | Dialog `Load the settings of Room 1?` with a line `Humidity target: <old> → 85 %`, **Load**, **Cancel**, no note field |
| 3 | Click **Load** | Dialog closes; `inSpRH` shows 85; event log shows `Settings loaded from room "Room 1"`; `simRoomMsg` = `Loaded the settings of Room 1.` |
| 4 | Click **Load settings from room** | No dialog; `simRoomMsg` = `Same settings as Room 1.` |
| 5 | Set **Mushroom** (`inCrop`) to Pink oyster; click **Save settings to room** | Dialog `Save these settings to Room 1?` listing `Mushroom: Grey oyster → Pink oyster`, a note field, **Save to room**, **Cancel** |
| 6 | Press Escape | `GET /api/rooms/1/settings/history` unchanged; `simRoomMsg` empty |
| 7 | Click **Save settings to room**, type `headless`, click **Save to room** | `simRoomMsg` = `Saved.` or `Saved with <n> warning(s): …`; `GET /api/rooms/1/settings` has `crop: 'pink'`; newest history row has `note: 'headless'` |
| 8 | Click **Save settings to room**; with the dialog open run `location.hash = '#/calibration'` | No `dialog` element left; no new history row; no console errors |
| 9 | Back to `#/simulator`; resume the run | `Room 1` still picked; the run continues from where it was |
| 10 | Stop the server; go to `#/calibration`, then `#/simulator` | `simRoom` and both buttons disabled; `simRoomMsg` starts with `The farm server cannot be reached.`; the clock advances; no uncaught errors (the failed fetch may log a network error) |

Record each step's result in your report.

## 8. Done when

- [ ] `web/simulator.js` has `createRoomLink` (5.1, 5.2), the wiring of 5.3, and exports `{ createRoomLink }` for Node only.
- [ ] Load passes the reply through `safeSettings` before any diff or `applySettings` (L4, L5).
- [ ] `FarmBench` and every wave 1 Simulator feature work as before.
- [ ] `tests/simulator-link.test.js` has T1, L1–L7, S1–S7, C1–C4, each seen failing before its code existed.
- [ ] Every command of 7.1 gives its expected result (`npm test` `fail 0`, 8 vector tests pass, only the two owned files changed).
- [ ] Headless steps 1–10 pass, with no console error except the expected network error of step 10.
- [ ] Texts exactly: `Same settings as <room>.`, `Load the settings of <room>?`, `Load`, `Settings loaded from room "<room>"`, `Loaded the settings of <room>.`, `The settings of <room> could not be read: <message>`, `<room> already has these settings.`, `Save these settings to <room>?`, `Save to room`, `From the Simulator`, `Saved.`, `Saved with <n> warning(s): …`, `No rooms on the farm server. Create one under Rooms.`
- [ ] Committed on your branch; report sent to the lead with the verification output and any contract problems.

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 3 | File ownership (spec section 6); report the need instead |
| Pass the `getSettings` reply to `applySettings` without `safeSettings`, or write your own sanitising | Lead decision 6; C6 7.6 owns `safeSettings` |
| Replace `cfg` with a new object | The controller holds it by reference; use `ClimateController.applySettings(cfg, roomSettings)` |
| Call `ctl.setStage`, `setCrop` or `setFarmType` on Load | They start a ramp that overwrites the loaded targets; C6 7.8 says only `cancelRamp()` |
| Copy the `PUT` reply's `settings` into `cfg` | Not in C6 7.8 |
| Send the file wrapper (`exportSettings`) | C3 3.5: bare Settings |
| Open `FarmApi.stream`, poll, retry, or add time-outs | The Simulator does not follow live rooms; C5 4.1 has no retries |
| Use `localStorage`, add a browser global, or change `FarmBench` | C5 1.4, 3.5 (the lead removes `FarmBench` in wave 3) |
| Put a room name or server text into `innerHTML` | C5 1.4 |
| Require any fake API file other than `tests/fakes/api-server.js`, or write your own fake | C5 1.6: that is the only fake API file; the lead wrote it |
| Change `tests/vectors/*` or run `npm run vectors` | The 8 recorded runs stay unchanged |
| Add npm packages, a bundler or a framework | Spec: no dependencies, no build step |
| Restrict the buttons to the installer level | C6 7.8 does not |
| Push, merge, rebase, or change git config | The lead merges after review |

## 10. Points this brief decides (report anything that does not fit)

| # | Point | Decision |
|---|---|---|
| 1 | Node test hook | `module.exports = { createRoomLink }` behind a `typeof module` guard; not a browser global |
| 2 | Test file | `tests/simulator-link.test.js`, owned by this stream |
| 3 | Save snapshot | `sent = structuredClone(cfg)` before the diff; the same object is diffed and sent |
| 4 | Extra texts | `Loaded the settings of <room>.`, `Saved with <n> warning(s): …`, `No rooms on the farm server. Create one under Rooms.` |
| 5 | After Load | `scheduleCropCheck()` when `farmType`, `crop` or `stage` changed; ladder redraw; charts dirty |
| 6 | Dialog cleanup | The wrapper keeps the dialog `showChanges` appended and closes and removes it in `unmount`. If `showChanges` does not append synchronously, report it; do not edit `settings-panel.js`. |
| 7 | `safeSettings` warnings on Load | Not shown (the diff already shows what will change) |
| 8 | Stored version differs from the sent one (C2 9.1) | Not shown; follow-up candidate |

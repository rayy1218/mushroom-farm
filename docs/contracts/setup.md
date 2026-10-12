# Contract C14: UX wave 4 (setup flow)

Date: 2026-10-12. Status: **frozen** (revision 1). Changes only through the lead (`docs/contracts/LEAD-DECISIONS.md`, decisions 109 on).
Source: `docs/reviews/2026-10-12-farmer-and-design-review.md` (farmer tasks 3 and 4, problems 3, 4 and 6, top-5 items 3 and 4). Builds on C11–C13, whose classes, helpers and layout stay in force; **C14 wins** where they differ. Branch `ux/wave4` starts from `ux/wave3`.

## 1. Streams

| Wave | Stream | Branch / worktree | Owns (only these files change) | Done when |
|---|---|---|---|---|
| prep | Lead | `ux/wave4` | `server/rooms.js` (`Live.ramp`), `tests/fakes/rooms.js`, `tests/rooms.test.js`, `tests/fake-rooms.test.js`, `web/ui.js`, `tests/web-ui.test.js`, this file | Built (section 2) |
| 1 | **Setup** | `stream/ux4-setup` | `web/rooms.js`, `tests/web-rooms.test.js` | Section 3 built |
| 1 | **Targets** | `stream/ux4-targets` | `web/settings-panel.js`, `web/room-settings.js`, `web/room-live.js`, `web/overview.js`, their tests (`tests/web-settings-panel.test.js`, `tests/web-room-settings.test.js`, `tests/web-room-live.test.js`, `tests/web-overview.test.js`), `web/room.css` | Section 4 built |
| 1 | **Blocks** | `stream/ux4-blocks` | `web/batches.js`, `web/harvest.css`, `tests/web-batches.test.js` | Section 5 built |

A stream never edits another stream's files; it asks the lead.

## 2. Lead prep (built)

### 2.1 `Live.ramp` (C2 5.2, C3 Live)

| Field | Type | Meaning |
|---|---|---|
| `ramp` | `{ to: { T, RH, CO2 }, endsAt }` \| `null` | While a stage, crop or farm-type change moves the targets (`ctl.state.stage.ramp`): the targets it moves to and the Unix time it arrives. `null` when no ramp runs or without a controller. Not part of the summary. |

### 2.2 `FarmUi` helpers

| Helper | Returns |
|---|---|
| `cropTargets(crop, stage)` | `{ T, RH, CO2, name, stageName, limits }` from `ClimateController.CROPS` (`limits` = `{ tMin, tMax, coreMax }`), or `null` for an unknown crop or stage. |
| `targetWarnings({ crop, stage, spT, spRH })` | Plain sentences, `[]` when the targets suit the crop (lead decision 110): temperature outside the crop's `limits` → `16 °C is outside what Grey oyster can take (20–30 °C).`; else 3 °C or more from the stage target → `Grey oyster fruiting usually runs at 25 °C; 22 °C is 3 °C colder.`; humidity 6 % or more from the stage target → `… usually runs at 88 % humidity; 80 % is 8 % drier.` |

## 3. Add a room in one step (Setup stream; `web/rooms.js`)

| Item | Rule |
|---|---|
| Form | The New room card (C12 5.1) becomes one form in a `.form-grid` with five `.field`s: **Room name** (required), **Room size** (`m³`, help `Length × width × height.`), **Mushroom** (a `<select>` of every crop in `ClimateController.CROPS` by name; default `oyster`), **Stage now** (a `.seg` of the farm type's stages: Spawn run, Pinning, Fruiting, Rest; default Fruiting), **Blocks in the room** (number ≥ 0, unit `blocks`, help `How many blocks are in the room now. 0 if it is empty.`). One primary button `Add room`, disabled until the name has a non-space character. |
| Saving | In this order: `createRoom({ name, volume })`; then `saveSettings(id, { crop, stage }, 'Set up')` (a partial settings object; C3 6.5's missing-key rule keeps the rest); then, when blocks > 0, `saveMix(id, [{ crop, blocks }])` (rows as C3 MixRow; see `web/api.js`). The button shows `Adding…` while it runs. |
| Result | Success: `say` good `Room "<name>" added: <mushroom>, <stage>, <n> blocks.`, the form resets and closes, the new card appears, and the page offers `a.btn.btn-link` `Open <name>` → `#/rooms/<id>/overview`. If the room was created but a later step failed: `say` error `Room "<name>" was added, but <what> was not saved: <error>. Set it on the room's Settings tab.` with a link to `#/rooms/<id>/settings`; no second room is created on retry (the form remembers the new id until it is reset). A failure of `createRoom` itself: `plainError` + `markFields` as C11. |
| Empty farm | With no rooms the card is open, and its heading reads `Add your first room`. |
| Tests | Pure helpers exported and tested: `setupPlan(form)` → the three calls with their bodies; `setupMessage(result)` for each success and partial case. |

## 4. Targets that follow the crop (Targets stream)

| Where | Rule |
|---|---|
| Settings panel, Crop and stage (`web/settings-panel.js`) | Under the Mushroom and Stage controls, a line `.crop-wants`: `<Mushroom> · <stage> wants 17 °C · 92 % · CO₂ under 1,000 ppm` from `cropTargets` for the crop and stage shown in the panel (the edited values, not only the stored ones). When the crop, stage or farm type differs from the stored settings, a second line in `.alert[data-lvl="info"]`: `After you save, the targets move to 17 °C and 92 % over <rampH> h.` |
| Settings panel, Targets | Under each target slider, the `targetWarnings` sentences for the values shown (amber `.field-help` with `▲`, `role="status"`), updated on every input. No warning, no line. |
| Save confirm (`web/room-settings.js`) | When `targetWarnings` for the saved values is not empty, the confirm box adds a section `Check before saving:` with the sentences; the buttons stay as they are (the farmer may still save on purpose). |
| Room Overview, Should be (`web/room-live.js`) | With `live.ramp`: `Should be: 25.0 °C · 88 % · CO₂ under 1,000 ppm · moving to 17 °C and 92 %, ready about 14:05` (farm time of `endsAt`; `ready tomorrow about 06:10` when it is not today). Without it: as now. The stored-settings comparison of C11 5.3 is replaced by `live.ramp`. |
| Overview room cards (`web/overview.js`) | With `live.ramp`: under the crop line, `Moving to <name> <stage> targets, ready about 14:05`. |
| Tests | Pure helpers exported and tested: `wantsText(crop, stage)`, `rampText(ramp, nowS)` (today / tomorrow / past), the confirm's warning section; a mount test that the warning line appears and clears as the slider moves. |

## 5. Blocks in one step (Blocks stream; `web/batches.js`)

| Item | Rule |
|---|---|
| New batch form | Adds **Put in room** (a `<select>`: `Not yet` (default) and every room from `listRooms()`), and `Placed on` (date, default today, shown only when a room is chosen). **Wet weight per block** is prefilled with `1.2` kg and **Moisture** with `60` % (lead decision 111), each with help `Typical for bought blocks. Change it if you weighed yours.` |
| Saving | `createBatch(...)`; when a room is chosen, then `placeBatch(id, { room_id, placed_at })`. Success: go to `#/batches/<id>` as now, with `say` good `Batch saved and placed in <room>.` If placing failed: still go to the batch, with `say` error `Batch saved, but not placed: <error>. Use Place in room below.` |
| From a room | `#/batches?room=<id>` is not a route (C12 2.1 routes are fixed), so the room frame's actions are not changed in this wave. |
| Tests | `batchPlan(form)` → the calls with bodies; the placed and the not-placed message; the prefilled values. |

## 6. Checks for every stream

| Check | How |
|---|---|
| Unit tests | `npm test` passes in the stream's worktree; pure helpers exported and tested. |
| Headless | Server from the worktree: `FARM_PORT=<port> FARM_DB=/tmp/uxw4/<stream>.db node --disable-warning=ExperimentalWarning server/main.js` (Setup 8121, Targets 8122, Blocks 8123); it prints its LAN URL. Drive it with `/tmp/uxreview/node_modules/playwright-core` and `/home/foqcus/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`. Viewport screenshots of every changed screen at 1440×900 and 390×844, light and dark, into `/tmp/uxw4/<stream>/`, and look at them. `scrollWidth` ≤ viewport; no console errors. Stop **only your own** server, by its PID. |
| Commits | On the stream branch; prefixes and layout are not reviewed. |

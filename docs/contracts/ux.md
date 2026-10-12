# Contract C11: UX wave 1 (quick wins from the farmer and design review)

Date: 2026-10-12. Status: **frozen** (revision 1). Changes only through the lead (`docs/contracts/LEAD-DECISIONS.md`, decisions 86 on).
Source: `docs/reviews/2026-10-12-farmer-and-design-review.md` (merged findings, wave 1 row).
Where C11 names a text, a class or a behaviour that C5 (`web.md`) or C10 (`harvest.md`) also names, **C11 wins**. Each stream updates the tests that pinned the old text.

## 1. Streams

| Wave | Stream | Branch / worktree | Owns (only these files change) | Done when |
|---|---|---|---|---|
| prep | Lead | `ux/wave1` | `web/shell.js`, `web/ui.js`, `server/rooms.js` (live.manual only), `tests/fakes/rooms.js`, `tests/web-shell.test.js`, `tests/web-ui.test.js`, `tests/rooms.test.js`, `tests/fake-rooms.test.js`, this file, `docs/contracts/LEAD-DECISIONS.md` | Sections 2 and 3 built and tested (done before the streams start) |
| 1 | **Style** | `stream/ux-style` | `styles.css`, `web/harvest.css`, `index.html` | Section 4 in CSS; every route has no sideways scroll at 390 px; screenshots at 1440 and 390 px checked |
| 1 | **Rooms** | `stream/ux-rooms` | `web/rooms.js`, `web/room-live.js`, `web/settings-panel.js`, `tests/web-rooms.test.js`, `tests/web-room-live.test.js`, `tests/web-settings-panel.test.js` | Section 5 built; tests pass |
| 1 | **Forms** | `stream/ux-forms` | `web/batches.js`, `web/harvest.js`, `web/room-simulate.js`, `web/room-equipment.js`, `web/room-calibrate.js`, `web/simulator.js`, `tests/web-batches.test.js`, `tests/web-harvest.test.js`, `tests/web-room-simulate.test.js`, `tests/web-room-equipment.test.js`, `tests/web-room-calibrate.test.js` | Section 6 built; tests pass |

A stream that needs a change in a file it does not own asks the lead. A stream never edits CSS outside its own files: the Rooms and Forms streams write the **markup** of section 4 and rely on the Style stream for the look. A stream may add a small `<style>`-free class of its own only through the lead.

## 2. Data

### 2.1 `Live.manual` (C2 5.2, C3 Live; lead, built)

| Field | Type | Values | Notes |
|---|---|---|---|
| `manual` | str[] | subset of `ac`, `hu`, `air`, `lights`, `circ`, in this order | The machines whose settings `manual.<key>.auto` is `false`. `[]` when the room has no loop or no settings. Not part of the room summary: the Rooms home sees it on its 30 s `listRooms` refresh. |

Names on screen (C11 wording): `ac` **Aircon**, `hu` **Mister**, `air` **Fresh-air fans**, `lights` **Lights**, `circ` **Circulation fan**.

`Room.adapter` (C3, already there): `sim` means the room is simulated. Only `sim` exists today.

## 3. Shared JS (lead, built)

### 3.1 `FarmShell.guardLeave(fn)`

| Item | Rule |
|---|---|
| Call | `FarmShell.guardLeave(fn)`; `fn()` returns a string. A non-empty string = the page has unsaved work, and the string says what (for example `1 unsaved change(s).`). `guardLeave(null)` removes the guard. |
| Leaving | On a route change the shell calls `fn()`. Non-empty: `confirm("<text>\n\nLeave this page and lose them?")`. Cancel puts the old hash back and nothing unmounts; OK goes on. |
| Lifetime | The shell clears the guard on every page change (before the next `mount` or `update`), so a module registers it in `mount` and again whenever it is remounted. A guard that throws counts as "nothing to lose". |
| Closing the tab | `beforeunload` asks with the browser's own box when `fn()` is non-empty. |
| Scroll | Every page change scrolls the window to the top (not a refresh of the same hash). |

### 3.2 `FarmUi.say(el, lvl, text)`

Adds class `alert` to `el`, sets `data-lvl` to `info`, `good` or `error`, sets the text; an empty text hides `el`. **Every** status or error message next to an action uses it. `.tag` is for quiet help text only, never for a status or an error.

### 3.3 `FarmUi.plainError(err, labels)` and `FarmUi.markFields(root, fields)`

| Function | Rule |
|---|---|
| `plainError(err, labels)` | `labels` maps an API field key (`block_count`) to its label. An ApiError detail `key: problem` whose key is in `labels` becomes `fields[key]`: `required` → `Fill this in.`, otherwise the problem with a capital and a full stop. `text` is `Check the marked field.` / `Check the marked fields.` (plus `Also: <other details>`), or `errorText(err)` when no field matched. |
| `markFields(root, fields)` | For each `.field[data-field]` under `root`: shows `fields[key]` in its `.field-err` (created if missing) and sets `aria-invalid="true"` on its controls; clears the others. Call with `{}` to clear. |
| Use | `const p = UI.plainError(e, LABELS); UI.say(msgEl, 'error', p.text); UI.markFields(form, p.fields);` |

## 4. Style (Style stream)

### 4.1 Type

| Item | Rule |
|---|---|
| Fonts | No web fonts (the farm device may be offline). `--font-body` and `--font-cond`: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. `--font-mono` stays, used only for numbers that update (values, clocks, tables of numbers). |
| Scale | Tokens `--fs-xs` 12px, `--fs-sm` 13px, `--fs-md` 15px, `--fs-lg` 18px, `--fs-xl` 22px, `--fs-2xl` 28px. New and touched rules use them. |
| `.tag` | Sans, `--fs-sm`, `--ink-2`. Help text only. |
| `<html lang>` | `en-MY` (dates as day/month/year). |

### 4.2 Form controls

Markup (Rooms and Forms streams write it; Style styles it):

```html
<div class="form-grid">
  <div class="field" data-field="block_count">
    <label for="btCount">Blocks</label>
    <div class="field-ctl"><input id="btCount" type="number"><span class="unit">blocks</span></div>
    <p class="field-help">How many blocks arrived.</p>
    <p class="field-err" hidden></p>
  </div>
</div>
```

| Class | Look |
|---|---|
| base controls | `:where(input:not([type=checkbox], [type=radio], [type=range]), select, textarea)` everywhere: 1px `--border-strong`, radius 6px, min-height 36px, padding 6px 10px, `--surface` background, `--fs-md`. A `:focus-visible` ring. `[aria-invalid="true"]`: `--critical` border. Low specificity (`:where`), so older specific rules still win until the Style stream removes them. |
| `.form-grid` | `display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px 16px; align-items: start`; one column below 480px. A child with `.span-all` spans every column. |
| `.field` | Label above (`--fs-sm`, weight 600, `--ink-2`), control full width (`width: 100%; min-width: 0`), help and error below. |
| `.field-ctl` | Control plus `.unit` suffix joined into one box (the unit inside the border, muted). |
| `.field-help` | `--fs-xs`, `--muted`. |
| `.field-err` | `--fs-sm`, the critical text colour, a leading `▲`. |
| `.chk` | Checkbox rows: 20px box, the whole row clickable, 36px tall. |

### 4.3 Buttons and messages

| Class | Look |
|---|---|
| `.btn` | min-height 36px (44px under `@media (pointer: coarse)`), sans, weight 600, `--fs-sm`. |
| `.btn-primary` | Filled: `--ink` background, `--surface` text (like `.hv-add`). One per form or card. |
| `.btn-danger` | `--critical` text and border; filled `--critical` on hover. |
| `.btn:disabled`, `.btn[aria-disabled="true"]` | Opacity .45, `cursor: not-allowed`, no hover change. |
| `.btn-row` | `display: flex; flex-wrap: wrap; gap: 8px; align-items: center`. Every group of two or more buttons is in one. |
| `.btn-link` | A link that looks like a button (`a.btn`): no underline. |
| `.alert` | Sans `--fs-sm`, padding 8px 12px, radius 6px, a 4px left border. `[data-lvl="info"]` `--border-strong` and `--band`; `good` `--good`; `error` `--critical` with a light critical tint. `[hidden]` hides it. |

### 4.4 Chips and badges

| Markup | Look |
|---|---|
| `.chip[data-lvl="warning"]` | Amber (already there). Out of band now uses it (5.1). |
| `.chip[data-kind="sim"]` | Dashed `--border-strong` border, `--muted` text. Text `Simulated`. |
| `.chip[data-kind="manual"]` | `--warning` border and tint, bold. Text `Manual: Aircon, Mister`. |
| `.chip[data-lvl="good"] .ico` | Uses `--good-text` (contrast 4.5:1). |

### 4.5 Rooms home and Live tab pieces

| Markup (written by the Rooms stream) | Look |
|---|---|
| `.room-card` (the existing card) contains `a.room-link` (the existing link) and, after it, `div.rc-actions.btn-row` | The card has a hover border; `rc-actions` sits at the bottom of the card. |
| `.rc-val` | Value on one line (`--fs-xl`, mono), its chip under it (not on the same line). |
| `.rc-badges` | A `btn-row`-like flex row of chips under the room name. |
| `p.rc-harvest` | `--fs-sm`. |
| `ul.machines > li.machine[data-dev][data-on][data-manual]` with `span.m-name`, `span.m-state`, optional `span.m-flag` | A grid of tiles (`repeat(auto-fill, minmax(150px, 1fr))`). Each tile has a 4px left stripe in the machine colour: `ac` `--s-ac`, `hu` `--s-hu`, `air` `--s-air`, `lights` `--s-li`, `circ` `--s-ci`, `power` `--border-strong`. `data-on="0"`: muted text and a light stripe. `.m-flag` is the manual chip look. |

### 4.6 Layout fixes

| Where | Fix |
|---|---|
| Batches (`.bt-form`, `.bd-form`) | Controls `width: 100%; min-width: 0`; no overlap; one column below 480px; no sideways scroll at 390px. The Forms stream moves these forms to `.form-grid` + `.field`; keep `.bt-form` / `.bd-form` working until then. |
| Header below 720px | `h1` `--fs-lg`; the menu one row that scrolls sideways; the level switch and theme button smaller; the bar at most about 110px tall at 390px. |
| Room details (`.room-details`) | Fields in a `.form-grid` (the Rooms stream writes the markup). |
| Live air glance (`div.room-air` outside a card) | Spans the whole row (`grid-column: 1 / -1`). |
| Touch | Under `pointer: coarse`: `.seg button` and checkboxes at least 44px / 24px. |
| Contrast | Muted 12px text at least 4.5:1 in both themes. |

## 5. Rooms (Rooms stream)

### 5.1 Rooms home (`web/rooms.js`)

| Item | Rule |
|---|---|
| Intro | Replace the two intro paragraphs with one line: `Your grow rooms. Green means all good. Amber or red means go and check.` When every room's `adapter` is `sim`, a second line in `.alert[data-lvl="info"]`: `No sensors are connected yet. These rooms are simulated: the numbers come from a computer model, not from your rooms.` |
| Feed text | `#rhFeed`: `Connected` (was `Live`), `Reconnecting…` unchanged. |
| `statusChip(room)` | Precedence: Stopped (`serious`) > open alarms (`warning`, `N alarm(s)`) > out of band (`warning`, `Check room`) > `good` `All good`. CO₂ out of band while `live.air.state` is `purge` or `after` does **not** count (the room is already fixing it). |
| Badges | `.rc-badges` under the name: `.chip[data-kind="sim"]` `Simulated` when `adapter === 'sim'`; `.chip[data-kind="manual"]` `Manual: <names>` when `live.manual` is not empty (names of 2.1, joined with `, `). |
| Values | Each `.rc-val`: value, then its chip on its own line (4.5). |
| Harvest | `p.rc-harvest`: `Harvest today: <kg> kg` (sum of `today.kg` over `getRoomHarvest(id).batches`, 1 decimal) or `No harvest today`; hidden when the call fails or the room has no placed batch. Loaded with the cards and on each 30 s refresh. |
| Record harvest | `div.rc-actions.btn-row` after the card link (not inside it): `a.btn.btn-primary.btn-link` `Record harvest` → `#/harvest/<id>`. |
| New room | `.form-grid` with `.field`s **Room name** (`#rhName`, required) and **Room size** (`#rhVolume`, unit `m³`, help `Length × width × height.`); `#rhCreate` is `.btn-primary`, disabled until the name has a non-space character. Messages through `say`. |

### 5.2 Room page frame (`web/rooms.js`)

| Item | Rule |
|---|---|
| Header | Next to `#rpAlarms`: the `Simulated` and `Manual: …` chips of 5.1 (`#rpSim`, `#rpManual`, hidden when not shown). `#rpAlarms` keeps its texts. |
| `#rpMsg` | Through `say`. |

### 5.3 Live tab (`web/room-live.js`, `web/settings-panel.js`)

| Item | Rule |
|---|---|
| Machines | `#lvMachines` becomes `ul.machines` with one `li.machine` per machine: Aircon (`Cool 25.0 °C`, `Off`), Mister (`Level 2`, `Off`), Fresh-air fans (`On` / `Off`), Lights, Circulation fan, and a Power tile (`432 W`, `data-dev="power"`). `data-manual="1"` and `span.m-flag` `Manual` when the key is in `live.manual`. |
| Targets | `#lvTargets`: `Should be: 25.0 °C · 88 % · CO₂ under 1,000 ppm`. During a ramp (the stored settings' `spT` differs from `live.targets.T` by 0.05 or more): add ` · moving to <spT> °C, <rhT> %` from the stored settings. |
| Unsaved | At mount: `FarmShell.guardLeave(() => { const n = panel ? panel.diff(base).length : 0; return n ? `${n} unsaved change(s).` : ''; })`. Also guard the Room details fields when they differ from the room. |
| Save bar | `#spSave` is `.btn-primary`, `#spDiscard` plain; both in a `.btn-row`. |
| Room details | `.form-grid` + `.field`s **Name**, **Room size** (`m³`); `#rdSave` primary; `#rdArchive` `.btn-danger`; messages through `say`. |
| Messages | `#lvMsg`, `#rdMsg` through `say`; API errors through `plainError` where a form has fields. |
| Air glance | The loose `div.room-air` line stays where it is (Style spans it, 4.6). |

## 6. Forms (Forms stream)

| Screen | Rule |
|---|---|
| Batches list (`web/batches.js`) | Tabs read `New` (received), `Growing` (placed), `Finished` (cleared); same states and ids. The new-batch form is `.form-grid` + `.field` with `data-field` = the API keys (`crop`, `strain`, `source`, `block_count`, `block_wet_kg`, `moisture_pct`, `received_at`); labels **Mushroom**, **Strain (seed type)**, **Bought from**, **Blocks**, **Wet weight per block** (`kg`), **Moisture** (`%`), **Arrived on**. Save is `.btn-primary`. A 400 → `plainError` + `markFields` + `say`. After a successful save: go to `#/batches/<new id>`. |
| Batch page | Same field markup; button `Clear` reads `Finish batch` (`.btn-danger`, confirm `Finish this batch? Its blocks are thrown out and it takes no more crates.`); groups `Blocks`, `Dates`, `Notes` as `.form-grid` sections; buttons in `.btn-row`; `Save changes` primary. |
| Harvest phone page (`web/harvest.js`) | After a crate is saved: `say(..., 'good', 'Saved ✓ <kg> kg')`. Under the page title a link `a.btn-link` `Back to <room name>` → `#/rooms/<id>/live`. Everything else unchanged (it is the reference screen). |
| Simulate tab (`web/room-simulate.js`) | The run buttons are disabled with a visible reason (`.field-help` next to them) while the crop mix is empty: `Add a mushroom and the number of blocks first.` A crop already in the mix is not offered again in the other rows. Button groups in `.btn-row`; the main run button `.btn-primary`. `Run a full cycle (83 days)` reads `Run full cycle · simulates 83 days in about 30 s`. Status and errors through `say`. |
| Your machines (`web/room-equipment.js`) | When the room's own size is big enough, the verdict reads `Your <size> is big enough.` (plus the smaller size that would also work, as now) — never `Buy this` on the size the room already has. Empty mix: `Add a mushroom and the number of blocks first.` Fields in `.form-grid` + `.field` with units as `.unit`; `Save machines` primary, not stretched. Messages through `say`. |
| Calibrate tab (`web/room-calibrate.js`) | A disabled **Fit** shows its reason in a `.field-help` beside it (for example `Needs at least 1 hour of readings. Come back in about <n> min.`). Messages through `say`. |
| Test bench (`web/simulator.js`) | Every `LIVE` label on the sandbox reads `SANDBOX`. **Reset** asks `Reset the test bench? The simulated room starts again from day 1.` Messages through `say`. |

## 7. Checks for every stream

| Check | How |
|---|---|
| Unit tests | `npm test` passes in the stream's worktree. Tests that pinned a text changed by C11 are updated, not deleted. |
| Headless | Start the server from the worktree: `FARM_PORT=<port> FARM_DB=/tmp/uxw1/<stream>.db node --disable-warning=ExperimentalWarning server/main.js` (Style 8091, Rooms 8092, Forms 8093). It listens on the LAN address it prints (for example `http://10.0.1.120:<port>`), not on 127.0.0.1. Drive it with `/tmp/uxreview/node_modules/playwright-core` and the headless shell `/home/foqcus/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`. Screenshot the stream's screens at 1440×900 and 390×844 into `/tmp/uxw1/<stream>/` and look at them. At 390px `document.documentElement.scrollWidth <= 390` on every screen the stream touched. Stop the server at the end. |
| Commits | On the stream branch only; prefixes and layout are not reviewed. |

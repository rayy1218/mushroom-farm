# Work brief: Harvest web (`web/batches.js`, `web/harvest.js`, `web/harvest.css`)

Revision 1, 2026-10-09 (wave 2, written in prep 2.0 from the frozen contracts on `master` e60dabf; harvest plan task 0.5). Stream: **Harvest web**. Implementer on Sonnet; the reviews (spec compliance, then code quality) run on Opus before the lead merges.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–69 (here: 59, 60, 63, 65, 66, 67, 68), and 74, 77, 78 (added on `master` after the freeze) | `docs/contracts/LEAD-DECISIONS.md` | They override this brief and every contract text |
| C10 revision 2 (batches and harvest by room QR) | `docs/contracts/harvest.md` | 1, 2 (owned files), 4 (`FarmHarvestRules`), 6 (Batch, BatchDetail, Crate, RoomHarvest, CrateSaved), 7 (error texts), 9 (routes and their rules), 10, 11 (routes and the bare layout, the shell's), 12 (the pages, helpers, ids, texts), 13 (tests and the pre-merge headless check) |
| C5 revision 8 | `docs/contracts/web.md` | 1.3 rows 23–24, 1.4 (wrapper; the vendored `qrcodegen` has none), 1.7, 2.1 (the four routes and their `params`), 3.1 (DOM scope: never `document.body`), 3.2 rows `batches` and `harvest`, 4.1–4.3 (the ten harvest functions), 4.5, 5 (`FarmUi`), 7.10 rows "Harvest web" and "harvest pages through the shell (lead, wave 3)" |
| C3 revision 9 | `docs/contracts/api.md` | 2.2 (`FARM_HOST`: never `0.0.0.0`), 4 (the error body), 9 (static files), 3.1 (Room) |
| Harvest spec and plan | `docs/superpowers/specs/2026-10-09-harvest-qr-design.md` (section 4); `docs/superpowers/plans/2026-10-09-harvest-qr/README.md` (task 0.5) | Background for the pages; C10 and C5 win where they differ |
| Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Sections 2 (step 5b, step 6), 3 (Harvest web row), 3.1, 4, 5, 6 |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/harvest-web.md` | Committed on `master` by the lead in prep 2.0; you do not edit it |

## 1. Goal

| Outcome | Measure |
|---|---|
| The Batches pages (`batches`) | Replace the prep 2.0 stub `web/batches.js`: the list with the tabs **Received · In rooms · Cleared**, the new batch form, the batch detail (edit, place, clear, delete, flushes, crates with Undo) (C10 12.3) |
| The phone page and the stickers page (`harvest`) | Replace the prep 2.0 stub `web/harvest.js`: the page a room's QR sticker opens (batch picker, picker name, **Add crate**, today's crates with Undo; C10 12.4) and the stickers page (one QR card per room, the address check, the advice, **Print**; C10 12.5) |
| The harvest stylesheet | Replace the stub `web/harvest.css`: every `.bt-*`, `.bd-*`, `.hv-*`, `.st-*` class, the bare layout rule `body[data-layout="bare"] .bar` hidden, the print rules (C10 12.2, 12.5; lead decision 65) |
| Tested | The Node helpers of C10 12.2 and the `#btCrop` options (C10 13); the pre-merge headless check of C5 7.10 / C10 13 against the gate 2.5 `master` |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/harvest-web` (below `<worktree>`), on branch `stream/harvest-web`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm`. |
| Git | Keep the configured identity (never change `git config`). Plain commit messages such as `feat(batches): …`, `feat(harvest): …`, `style(harvest): …`, `test(harvest): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase; never merge `master` into your branch. |
| Gate 2.5 | The harvest routes exist on the real server only after the lead's gate 2.5 (Harvest data and Harvest API merged, `server/main.js` wired, C10 8.4). Do tasks 0–10 (Node), commit, tell the lead you wait for gate 2.5, then run task 11 (the headless check) when the lead says it passed |
| The shell | The Room shell's `web/shell.js` (the four routes, the bare layout) merges in wave 3. The gate 2.5 tree has the wave 1 shell, which does not know `#/batches` or `#/harvest/…`: your check mounts your modules by hand (7.2). The addresses through the shell and the shell's bare layout are the lead's wave 3 check |

| Check (from `<worktree>`) | Expected; otherwise stop and report to the lead |
|---|---|
| `git branch --show-current` | `stream/harvest-web` |
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` (C5 1.6) | All three listed |
| `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js web/batches.js web/harvest.js web/harvest.css` (C5 1.7) | All eight listed |
| `grep -c 'web/room-tabs.js' index.html` (C5 1.7) | `1` |
| `ls harvest-rules.js server/harvest-schema.js server/api-common.js tests/fakes/harvest-db.js web/vendor/qrcodegen.js tests/qrcodegen.test.js` (harvest plan task 0.5) | All six listed |
| `cat web/batches.js web/harvest.js web/harvest.css` | The prep 2.0 stubs: the C5 1.4 wrapper twice (registering nothing), then `/* Harvest pages (C10 12): written by the Harvest web stream. */` |
| `grep -c -e 'web/harvest.css' -e 'web/batches.js' -e 'web/harvest.js' -e 'web/vendor/qrcodegen.js' -e 'harvest-rules.js' index.html` | `5` |
| `grep -n -e listBatches -e createBatch -e getBatch -e updateBatch -e placeBatch -e clearBatch -e deleteBatch -e getRoomHarvest -e addCrate -e undoCrate web/api.js \| wc -l` | At least `10` (the C10 12.1 functions, lead, prep 2.0) |
| `node --test tests/qrcodegen.test.js` | `# pass 2` |
| `npm test` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `K0` |

Read before you code: `harvest-rules.js` (`state`, `totals`, `flushes`, `DEFAULTS`, `LIM`, `checkBatch`, `checkCrate`), `tests/qrcodegen.test.js` (its `load()` through `node:vm`), `web/vendor/qrcodegen.js` (the API `qrcodegen.QrCode.encodeText`, `QrCode.Ecc.QUARTILE`, `qr.size`, `qr.getModule(x, y)`), `web/api.js` (the ten functions), `web/ui.js` (`errorText`, `farmClock`), `tests/fakes/api-server.js` (`GET /api/batches` → `[]`).

## 3. Owned files (the only files you may touch; C10 2, wave 2 plan 3 Harvest web row)

| File | Action | Content |
|---|---|---|
| `web/batches.js` | Replace the prep 2.0 stub | Registers `batches`; the Batches pages (C10 12.3); Node export `{ dateToSeconds, secondsToDate, ageDays, batchBody }` |
| `web/harvest.js` | Replace the prep 2.0 stub | Registers `harvest`; the phone page (C10 12.4) and the stickers page (C10 12.5); Node export `{ parseKg, summaryText, stickerLink, isLocalHost, qrSvg }` |
| `web/harvest.css` | Replace the prep 2.0 stub | C10 12.2, 12.5; section 5.6 |
| `tests/web-batches.test.js` | Create | Section 6 |
| `tests/web-harvest.test.js` | Create | Section 6 |

| Not yours | Owner |
|---|---|
| `harvest-rules.js`, `web/vendor/qrcodegen.js`, `tests/harvest-rules.test.js`, `tests/qrcodegen.test.js`, `server/harvest-schema.js`, `server/api-common.js`, `tests/fakes/harvest-db.js` | Lead (prep 2.0), then nobody (C10 2) |
| `index.html`, `web/api.js`, `tests/web-api.test.js`, `tests/fakes/api-server.js` | Lead (prep 2.0), then nobody |
| `web/shell.js` (the four routes, `MENU_NAMES`, the bare layout), `styles.css` | Room shell (lead decisions 32, 65, 66) |
| `server/harvest-db.js`, `server/harvest-api.js` and their tests | Harvest data, Harvest API |
| `server/main.js` | Lead (gate 2.5) |
| Everything else | Read-only |

| Rule | Detail |
|---|---|
| CSS | Every harvest style goes into `web/harvest.css`; nothing into `styles.css` (lead decisions 32, 65). Use the existing variables of `styles.css` (`--surface`, `--border`, `--muted`, `--ink`, `--critical`, `--good`, `--band`) so both themes work |
| Blocked | If something outside your files blocks you (a C10 route that answers otherwise than C10 9 on the gate 2.5 tree, for example), stop that part and report it to the lead |

## 4. What you build against

| Source | What you take from it |
|---|---|
| C10 12.2 | The two Node exports and every helper's exact rule |
| C10 12.3 | The Batches list, the new batch form, the detail page: every id and text |
| C10 12.4 | The phone page: load, `#hvRoom`, the picker, the name, the weigh step, saved, failures, Undo |
| C10 12.5 | Cards, the address check, the advice, the print CSS |
| C10 6, 7, 9 | The JSON you read; the 400 and 404 texts you react to (`Invalid batch`, `Invalid crate`, `Batch is already in a room`, `Batch is not in a room`, `Batch is cleared`, `Batch has crates`, `Crate is already undone`, `Unknown batch`, `Unknown crate`, `Unknown room`) |
| C10 11, C5 2.1 | `params`: `batches` `{}` or `{ id }`; `harvest` `{ view: 'record', id }` or `{ view: 'stickers' }`; the shell sets `body[data-layout="bare"]` on `#/harvest/:id` (you never do) |
| C5 1.3, 1.4 | Load order (your files need `FarmShell` at load; `FarmApi`, `FarmUi`, `FarmHarvestRules`, `ClimateController`, `qrcodegen` only at call time); wrapper; no DOM at load; markup as a template string set once per mount; every dynamic text with `textContent` |
| C5 3.1 | DOM scope: only `el` and its descendants, plus a dialog; never `document.body` (the `data-layout` is the shell's) |
| C5 4.1–4.3 | `listBatches({ state, room })`, `createBatch`, `getBatch`, `updateBatch`, `placeBatch`, `clearBatch`, `deleteBatch`, `getRoomHarvest`, `addCrate`, `undoCrate`, `listRooms`; `ApiError` (`status` 0 when the server cannot be reached) |
| C5 7.10, C10 13 | The Node tests and the pre-merge headless check (exact) |

| Lead decision | As it applies to this stream |
|---|---|
| 59, 60 | Harvest code lives in your new files; shared files got only the lead's registration lines |
| 63 | No 409: every state conflict is a 400 with its own `error` text |
| 65 | `web/harvest.css` is yours; `styles.css` is the Room shell's |
| 66 | The shell sets and removes `body[data-layout="bare"]`; your modules never touch `document.body` |
| 67 | "Today" starts at the farm device's local midnight (`TZ=Asia/Kuala_Lumpur`); the page's farm dates are UTC+8 whatever the browser's zone |
| 68 | A placed batch keeps taking crates after its room is archived; a crate of a cleared batch can still be undone |
| 74 | Harvest test files start with a comment, `'use strict'`, then the `TZ` line (the form this brief also uses for its two test files) |
| 77 | The server's date-order rules compare farm days (`startOfDay`), not seconds: a batch received today may be placed or cleared with today's date; the pages send every date as 00:00 farm time (`dateToSeconds`) |
| 78 | When the page places or clears a batch with today's date (00:00 farm time) and the batch was received or placed earlier today, the API stores the later time (it clamps within the same farm day) and replies with it; the page shows the time from the reply, never the date it sent |

## 5. Design (fixed by this brief where the contracts leave it open)

### 5.1 Module shape (both files)

| Item | Rule |
|---|---|
| Wrapper | The C5 1.4 wrapper. At load exactly one call: `global.FarmShell.register('batches', { mount, unmount })` / `global.FarmShell.register('harvest', { mount, unmount })`. No global |
| Node export | The last statement inside the wrapper (as C5 7.8): `if (typeof module === 'object' && module && module.exports) module.exports = { dateToSeconds, secondsToDate, ageDays, batchBody };` and `… = { parseKg, summaryText, stickerLink, isLocalHost, qrSvg };`. Exactly these names (C10 12.2) |
| At load | No DOM, no `FarmApi` call, no timer, no `localStorage`. `FarmApi`, `FarmUi`, `FarmHarvestRules`, `ClimateController`, `qrcodegen` are read inside functions |
| DOM | Only through `el` (`el.querySelector`, `el.querySelectorAll`), never `document.getElementById` or `document.body`; `document.createElement` for new nodes; `confirm()` for the confirmations of C10 12.3, 12.4 |
| `mount(el, params)` | Markup (set once with `innerHTML`); one wrapper element per view, spanning the grid (`div.bt-page`, `div.bd-page`, `div.hv-page`, `div.st-page`); then the view's loads |
| `unmount()` | `alive = false`: every pending `await` checks it and never touches the DOM afterwards. No timer, no stream to stop |
| Farm time | Dates through `dateToSeconds` / `secondsToDate`; times of day with `FarmUi.farmClock().hm(t)` |

### 5.2 Helpers (Node exports; pure)

| Helper | Signature → result | Rule (C10 12.2) |
|---|---|---|
| `dateToSeconds(text)` | `('YYYY-MM-DD') → int \| null` | `Date.UTC(y, m − 1, d) / 1000 − 8 × 3600` (00:00 farm time, whatever the browser's zone); `null` for an empty text, a text not of the form `YYYY-MM-DD`, or a day that does not exist (read back with the UTC getters it differs) |
| `secondsToDate(t)` | `(int) → 'YYYY-MM-DD'` | `new Date((t + 8 × 3600) × 1000)` read with `getUTCFullYear`, `getUTCMonth`, `getUTCDate` |
| `ageDays(from, now)` | `→ int` | `Math.floor((now − from) / 86400)` |
| `batchBody(form)` | `({ edit, fields }) → object` | `fields`: input values as strings, keyed by the C10 batch field names (`crop`, `strain`, `source`, `block_count`, `block_wet_kg`, `moisture_pct`, `spawn_date`, `received_at`, `flush_gap_days`, `notes`); only the keys present are read. Texts (`strain`, `source`, `notes`) trimmed; numbers (`block_count`, `block_wet_kg`, `moisture_pct`, `flush_gap_days`) trimmed then `Number(text)` when that is finite, else the trimmed text as it is (so the server's `checkBatch` names the field); dates (`spawn_date`, `received_at`) through `dateToSeconds`; `crop` as it is. An empty value (after trimming): left out when `edit` is `false` (create), sent as `null` when `edit` is `true` (edit). C10 12.2 names the one argument `form`; this brief fixes its shape |
| `parseKg(text)` | `→ number \| null` | After trimming: `^\d+([.,]\d+)?$` → the number (a comma read as the decimal point): `12.5`, `12,5`, ` 12.5 ` give 12.5, `0` gives 0 (the server answers the range); anything else → `null` (no unit, no sign, no `.5`, no `12.`) |
| `summaryText(batch)` | `(RoomHarvest batch) → string` | `today.crates` empty → `No crates today`; else `` `Flush ${batch.flush} · ${batch.today.kg} kg today · ${n} ${n === 1 ? 'crate' : 'crates'}` `` |
| `stickerLink(origin, roomId)` | `→ string` | `` `${origin}/#/harvest/${roomId}` `` |
| `isLocalHost(hostname)` | `→ bool` | `true` for `localhost`, `127.0.0.1`, `[::1]`, `::1`; `false` for anything else (`127.0.0.2` included) |
| `qrSvg(qrcodegen, text)` | `→ string` | `qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.QUARTILE)`; `n = qr.size + 8` (a 4-module quiet zone on each side); returns `<svg xmlns="http://www.w3.org/2000/svg" class="st-qr" viewBox="0 0 <n> <n>" shape-rendering="crispEdges"><rect width="<n>" height="<n>" fill="#fff"/><path d="<d>" fill="#000"/></svg>` with `d` = `M<x + 4>,<y + 4>h1v1h-1z` for every dark module (`qr.getModule(x, y)`), rows top to bottom, left to right. Exactly one `<path>`; only numbers and fixed text in the string |

### 5.3 Batches pages (`batches`, C10 12.3)

`CROP` = the crops with a fruiting range: `Object.keys(ClimateController.CROPS).filter(k => ClimateController.CROPS[k].range)` (the `harvest-rules.js` `hasCrop` rule), shown by `CROPS[k].name` (lion's mane is included once Equipment has merged). `name(k)` = `CROPS[k] ? CROPS[k].name : k`.

| Part | Markup and behaviour |
|---|---|
| List `{}` | `div.bt-page`: `div.bt-tabs` (`role="group"`) with `button#btTabReceived` `Received`, `button#btTabPlaced` `In rooms` (pressed at mount), `button#btTabCleared` `Cleared` (`aria-pressed`); `a.btn#btStickers[href="#/harvest/stickers"]` `Print QR stickers`; `table.bt-list#btList` (head Crop, Strain, Room, Age (days), kg, g per block, BE %; one `tr[data-id="<id>"]` per Batch of `listBatches({ state })`: `name(crop)`, `strain` or `–`, `room_name` or `–`, the age, `totals.kg`, `totals.g_per_block`, `totals.be_pct`); `p.tag#btMsg` (`role="status"`). A row click: `location.hash = '#/batches/<id>'` |
| Age | Received: `ageDays(received_at, now)`; placed: `ageDays(placed_at, now)`; cleared: `ageDays(placed_at, cleared_at)` |
| Tabs | A click sets `aria-pressed`, `state` = `received` / `placed` / `cleared`, reloads `listBatches({ state })`. A reply of an older click is dropped |
| New batch | `form.bt-form#btForm` (`h3` `New batch`): `select#btCrop` (one `option` per `CROP`, `value` the key, text the name, appended with `document.createElement('option')` during `mount`, before any `await`), `input#btStrain` (`maxlength` = `FarmHarvestRules.LIM.text`), `input#btSource` (same), `input#btCount` (number, `min="1"`), `input#btKg` (number, `step="0.01"`, label `Wet weight per block (kg)`), `input#btMoist` (number, value `FarmHarvestRules.DEFAULTS.moisture_pct`), `input#btReceived` (`type="date"`, value `secondsToDate(now)`), `button.btn#btSave` `Save`. Submit (default prevented): `#btSave` disabled; `createBatch(batchBody({ edit: false, fields }))`; success: empty `#btStrain`, `#btSource`, `#btCount`, `#btKg`, switch to the **Received** tab and reload, `#btMsg` = `Saved.`; an `ApiError` (a 400 shows its `details`): `#btMsg` = `FarmUi.errorText(err)` (`Invalid batch: block_count: required`). Finally `#btSave` enabled |
| Detail `{ id }` | `getBatch(id)`. 404 `Unknown batch`: `div.bd-page` holds only `p.est-note` `This batch does not exist.` and `a[href="#/batches"]` `Batches`. Else `div.bd-page`: `h2#bdHead` = `<name(crop)> · <strain or –> · <Received \| In <room_name> \| Cleared>`; `p.tag#bdWait` = `Received to placed: <ageDays(received_at, placed_at)> days` once placed (hidden while received); `form.bd-form#bdForm` with `select#bdCrop` (the `CROP` options), `input#bdStrain`, `input#bdSource`, `input#bdCount`, `input#bdKg`, `input#bdMoist`, `input#bdSpawn` (date), `input#bdReceived` (date), `input#bdGap` (number, label `Days between flushes`), `textarea#bdNotes` (`maxlength` = `LIM.notes`), `button.btn#bdSave` `Save changes`; `div.bd-actions`: `select#bdRoom` (`listRooms()`, `option` value the id, text the name) and `button.btn#bdPlace` `Place in room` (both only while received), `button.btn#bdClear` `Clear` (only while placed), `button.btn#bdDelete` `Delete` (only while `totals.crates === 0`); `table.bd-flushes#bdFlushes` (head Flush, First, Last, kg, g per block, BE %; one row per `flushes` entry: `n`, `secondsToDate(from)`, `secondsToDate(to)`, `kg`, `g_per_block`, `be_pct`); `table.bd-crates#bdCrates` (head Time, kg, Picker, –; one row per live crate, newest first: `<secondsToDate(t)> <farmClock().hm(t)>`, `kg`, `picker` or `–`, `button.btn[data-undo="<crateId>"]` `Undo`); `p.tag#bdMsg` (`role="status"`) |
| **Save changes** | `body` = `batchBody({ edit: true, fields })` reduced to the fields whose value differs from the Batch's (`{}` → `#bdMsg` = `Nothing to change.`, no request); `updateBatch(id, body)`; reload; `#bdMsg` = `Saved.`; an `ApiError`: `errorText` |
| **Place in room** | `placeBatch(id, { room_id: Number(#bdRoom.value) })` (`placed_at` left out: now); reload; an `ApiError` (`Invalid batch: room_id: no such room`, `Batch is already in a room`): `errorText` |
| **Clear** | `confirm('Clear this batch? Crates can no longer be added.')`; `clearBatch(id)` (sends `{}`); reload; `ApiError`: `errorText` |
| **Delete** | `confirm('Delete this batch? It cannot be undone.')`; `deleteBatch(id)`; `location.hash = '#/batches'`; `ApiError` (`Batch has crates`): `errorText` |
| **Undo** (crate) | `confirm('Undo the crate of <kg> kg?')`; `undoCrate(crateId)`; reload; `ApiError` (`Crate is already undone`): `errorText` |

### 5.4 Phone page (`harvest`, `{ view: 'record', id }`, C10 12.4)

Mobile-first, large tap targets for gloved, wet hands (5.6). The shell hides the menu bar (bare layout); the module does not touch `document.body`.

| Part | Markup and behaviour |
|---|---|
| Load | `div.hv-page`; `data = await getRoomHarvest(id)`. 404 `Unknown room`: the page holds only `p.hv-msg` `This room does not exist or is archived.` and nothing else. Another error: `#hvMsg` (class `err`) = `errorText(err)` |
| `#hvRoom` | `h2#hvRoom` = `data.room.name` |
| Picker | `div.hv-pick#hvPick`. One placed batch: picked at once, no picker shown. Several: one `button.hv-batch[data-batch="<id>"]` each, text `<name(crop)> · <strain or –> · placed <secondsToDate(placed_at)>`; a click picks it. None: `p#hvNone` `No batch in this room. Ask the office to place one.` and no weigh part. `button.btn#hvChange` `Change batch` (shown only when several batches and one is picked) returns to the picker |
| Picked batch line | `p.hv-picked#hvPicked` = the picked batch's button text |
| Name | `label` `Your name (optional)` + `input.hv-name#hvName` (`maxlength` = `FarmHarvestRules.LIM.picker`); value from `localStorage['farm.picker']` at mount (read in `try`; a throw = empty); a `change` stores the trimmed value (in `try`) |
| Weigh | `label` `Weight (kg)` + `input.hv-kg#hvKg` (`inputmode="decimal"`, `autocomplete="off"`); `button.hv-add#hvAdd` `Add crate` |
| **Add crate** | `kg = parseKg(#hvKg.value)`; `null` → `#hvMsg` = `Type the weight in kg, for example 12.5` (no class `err`), no request. Else `#hvAdd.disabled = true` at once (so a double tap sends one request); `addCrate(batchId, { kg, picker })` with `picker` = the trimmed name, left out when empty. Success: `#hvKg` emptied; `#hvMsg` empty; reload `getRoomHarvest(id)` (the picked batch kept by id); `#hvSummary` = `summaryText(batch)`; `#hvToday` repainted; focus `#hvKg`. Failures (C10 12.4): status 0 or 500 → the value stays, `#hvMsg` (class `err`) = `Not saved: check Wi-Fi and press Add crate again`; 400 `Invalid crate` → `#hvMsg` (class `err`) = the first `details` entry; 400 `Batch is cleared` or `Batch is not in a room`, 404 `Unknown batch` → `#hvMsg` (class `err`) = `This batch was cleared`, then the picker reloads (`getRoomHarvest`, the pick reset). Finally `#hvAdd.disabled = false` |
| Saved | `p.hv-summary#hvSummary`; `ul.hv-today#hvToday`: per today's crate (`today.crates`, newest first) `li[data-crate="<id>"]` with `farmClock().hm(t)`, `<kg> kg`, the picker (or nothing), `button.btn[data-undo="<id>"]` `Undo` |
| **Undo** | `confirm('Undo the crate of <kg> kg?')`; `undoCrate(crateId)`; reload. `ApiError`: `#hvMsg` (class `err`) = `errorText` |
| Message | `p.hv-msg#hvMsg` (`role="status"`); class `err` only for the failure texts above |

### 5.5 Stickers page (`harvest`, `{ view: 'stickers' }`, C10 12.5)

| Part | Markup and behaviour |
|---|---|
| Head | `div.st-page`: `h2` `QR stickers`; `button.btn#stPrint` `Print`; `p.st-warn#stWarn`; `div.st-advice#stAdvice` with two `p`: `Laminate the stickers or print on waterproof labels: the rooms run at 90 % humidity.` and `Give the farm device a fixed address on the router; if its address changes, every sticker stops working.` |
| Address check | `isLocalHost(location.hostname)`: `#stWarn` shown with `Open this page from the farm address (for example http://192.168.1.20:8080); phones cannot reach localhost.` and `#stPrint` disabled. Otherwise `#stWarn` hidden and `#stPrint` calls `window.print()` |
| Cards | `rooms = await listRooms()`; `div.st-cards`; per room `div.st-card[data-room="<id>"]`: `p.st-name` (the name, `textContent`), `div.st-qrbox` whose `innerHTML` is `qrSvg(qrcodegen, stickerLink(location.origin, id))` (the string holds only numbers and fixed text; the one allowed `innerHTML` with generated content), `p.st-link` (the link, `textContent`), `p.st-scan` `Scan to record harvest`. An `ApiError`: `p.tag` with `errorText` |

### 5.6 `web/harvest.css`

Every selector is prefixed (`.bt-`, `.bd-`, `.hv-`, `.st-`), except the bare layout rule and the print rules, so the file changes no other page.

| Selector | Rule |
|---|---|
| `body[data-layout="bare"] .bar` | `display: none` (lead decision 66: the shell sets the attribute; this rule hides the menu bar) |
| `.bt-page`, `.bd-page`, `.hv-page`, `.st-page` | `grid-column: 1 / -1; display: grid; gap: 12px; min-width: 0` |
| `.bt-tabs` | `display: flex; gap: 4px; flex-wrap: wrap`; its buttons as `.seg` buttons (`[aria-pressed="true"]` with `background: var(--band); font-weight: 600`) |
| `.bt-list`, `.bd-flushes`, `.bd-crates` | `width: 100%; border-collapse: collapse`; cells `padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left`; `.bt-list tr[data-id]` `cursor: pointer`, hover `background: var(--band)` |
| `.bt-form`, `.bd-form` | `display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px 12px; align-items: end` |
| `.bd-actions` | `display: flex; flex-wrap: wrap; gap: 8px; align-items: center` |
| `.hv-page` | `max-width: 520px; margin: 0 auto; width: 100%` |
| `.hv-batch`, `.hv-add` | `display: block; width: 100%; min-height: 64px; font-size: 20px; border-radius: 8px` |
| `.hv-kg` | `width: 100%; font-size: 32px; min-height: 64px; text-align: center` |
| `.hv-name` | `width: 100%; font-size: 18px; min-height: 48px` |
| `.hv-msg.err` | `color: var(--critical); font-weight: 600` (the red line) |
| `.hv-today` | `list-style: none; padding: 0; margin: 0`; `li` `display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border)`; its Undo button `min-height: 44px` |
| `.st-cards` | `display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px` |
| `.st-card` | `border: 1px solid var(--border-strong); border-radius: 6px; padding: 10px; text-align: center; background: #fff; color: #000` |
| `.st-name` | `font-size: 24px; font-weight: 700; margin: 0` |
| `.st-qr` | `width: 160px; height: 160px` (screen) |
| `.st-link` | `font: 12px var(--font-mono); word-break: break-all; margin: 4px 0` |
| `.st-warn` | `color: var(--critical); font-weight: 600` |
| `@media print` | `@page { size: A4; margin: 10mm }`; `.bar, .st-page button, #stWarn, #stAdvice { display: none }`; `.st-cards { grid-template-columns: repeat(2, 90mm); gap: 4mm }`; `.st-card { width: 90mm; height: 88mm; break-inside: avoid; box-sizing: border-box }` (two per row, 6 per page); `.st-qr { width: 60mm; height: 60mm }` |

### 5.7 Texts (exact)

| Where | Text |
|---|---|
| Batches list | `Received`, `In rooms`, `Cleared`, `Print QR stickers`, `New batch`, `Save`, `Saved.` |
| Detail | `This batch does not exist.`, `Received to placed: <n> days`, `Place in room`, `Clear`, `Delete`, `Save changes`, `Nothing to change.`, `Saved.`, `Clear this batch? Crates can no longer be added.`, `Delete this batch? It cannot be undone.`, `Undo the crate of <kg> kg?` |
| Phone page | `This room does not exist or is archived.`, `No batch in this room. Ask the office to place one.`, `Change batch`, `Your name (optional)`, `Weight (kg)`, `Add crate`, `Type the weight in kg, for example 12.5`, `Not saved: check Wi-Fi and press Add crate again`, `This batch was cleared`, `No crates today`, `Flush <n> · <kg> kg today · <n> crate(s)`, `Undo the crate of <kg> kg?` |
| Stickers | `QR stickers`, `Print`, `Open this page from the farm address (for example http://192.168.1.20:8080); phones cannot reach localhost.`, `Laminate the stickers or print on waterproof labels: the rooms run at 90 % humidity.`, `Give the farm device a fixed address on the router; if its address changes, every sticker stops working.`, `Scan to record harvest` |

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, then implement, see it pass, `npm test`, commit)

### 6.1 Test file headers

Both files set the zone first, before any `require` or `Date` call (C10 13: the farm-time helpers must not depend on it; the line keeps the tests the same on any machine), after the header comment and `'use strict'` (lead decision 74).

`tests/web-batches.test.js`:

```js
// web/batches.js: helpers and the #btCrop options (docs/contracts/harvest.md 12.2, 12.3, 13).
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller']) require(`../${f}.js`);
require('../harvest-rules.js'); require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
const B = require('../web/batches.js');
const CC = globalThis.ClimateController, HR = globalThis.FarmHarvestRules;
```

`tests/web-harvest.test.js`:

```js
// web/harvest.js: helpers (docs/contracts/harvest.md 12.2, 13).
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
for (const f of ['sim', 'air', 'controller']) require(`../${f}.js`);
require('../harvest-rules.js'); require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
const V = require('../web/harvest.js');
function loadQr() {             // as tests/qrcodegen.test.js: the vendored file is a classic script, require gives no global
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/vendor/qrcodegen.js'), 'utf8') + '\nthis.qrcodegen = qrcodegen;', ctx);
  return ctx.qrcodegen;
}
```

The `#btCrop` test mounts `batches` with a recording DOM stub (no browser), against the lead's fake API server:

```js
const stubs = {};
function mk(tag) {
  return { tag, children: [], dataset: {}, style: {}, attrs: {}, value: '', textContent: '', hidden: false, disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, replaceChildren(...c) { this.children = c; },
    addEventListener() {}, removeEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    querySelector: sel => (stubs[sel] ||= mk(sel)), querySelectorAll: () => [], focus() {} };
}
```

### 6.2 Tasks

| # | Test(s) first | Then build | What it proves |
|---|---|---|---|
| 0 | – | Section 2 checks; read the files listed there. No commit | The start state |
| 1 | **BT1 module**: `registered.batches` has `mount`, `unmount`; `Object.keys(B).sort()` deep-equals `['ageDays', 'batchBody', 'dateToSeconds', 'secondsToDate']`; loading did no DOM work. **HV1 module**: `registered.harvest` has `mount`, `unmount`; `Object.keys(V).sort()` deep-equals `['isLocalHost', 'parseKg', 'qrSvg', 'stickerLink', 'summaryText']` | Both skeletons: wrapper, `register`, the Node export | C5 1.3, 1.4; C10 12.2 |
| 2 | **BT2 dates**: `B.dateToSeconds('2026-10-08') === 1791388800`; `B.dateToSeconds('')`, `('x')`, `('2026-13-01')`, `('2026-02-30')`, `('2026-1-5')` → `null`; `B.secondsToDate(1791388800)` = `'2026-10-08'`; `B.secondsToDate(1791388799)` = `'2026-10-07'`; `B.secondsToDate(B.dateToSeconds('2026-12-31')) === '2026-12-31'`. **BT3 ageDays**: `B.ageDays(1791388800, 1791388800 + 3 * 86400 - 1)` = 2; `+ 3 * 86400` → 3 | `dateToSeconds`, `secondsToDate`, `ageDays` | C10 12.2, lead decision 67 |
| 3 | **BT4 batchBody**: create `{ edit: false, fields: { crop: 'oyster', strain: ' PO-2 ', source: '', block_count: '1000', block_wet_kg: '1.2', moisture_pct: '60', spawn_date: '', received_at: '2026-10-08', flush_gap_days: '', notes: '  ' } }` deep-equals `{ crop: 'oyster', strain: 'PO-2', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: 1791388800 }` and `HR.checkBatch(body, false)` is `[]`; edit `{ edit: true, fields: { strain: '', notes: 'late', spawn_date: '', block_count: '900' } }` deep-equals `{ strain: null, notes: 'late', spawn_date: null, block_count: 900 }`; `block_count: '12a'` → `'12a'` (a string: `checkBatch` names it); a key not in `fields` is not in the body | `batchBody` | C10 12.2 |
| 4 | **BT5 #btCrop options** (C10 13): `const { startFakeApi } = require('./fakes/api-server.js'); fake = await startFakeApi(); FarmApi.base = fake.url;` `globalThis.document = { createElement: mk };` `el = mk('main')` with an `innerHTML` setter that does nothing; `registered.batches.mount(el, {})` (not awaited for the options); `stubs['#btCrop'].children.map(o => ({ value: o.value, text: o.textContent }))` deep-equals `Object.keys(CC.CROPS).filter(k => CC.CROPS[k].range).map(k => ({ value: k, text: CC.CROPS[k].name }))`; then `registered.batches.unmount()`, wait for the pending `listBatches` (`GET /api/batches?state=placed` recorded in `fake.requests`), `await fake.close()`, `delete globalThis.document` (in `t.after`) | The options built in `mount` before any `await` (5.3 row "New batch") | C10 12.3, 13 |
| 5 | **HV2 parseKg**: `'12.5'`, `'12,5'`, `' 12.5 '` → 12.5; `'0'` → 0; `'7'` → 7; `'12kg'`, `'-1'`, `'+1'`, `''`, `'1.2.3'`, `'12.'`, `'.5'`, `'abc'` → `null`. **HV3 summaryText**: `{ flush: 2, today: { crates: [1, 2, 3, 4, 5].map(id => ({ id })), kg: 14.6 } }` → `Flush 2 · 14.6 kg today · 5 crates`; one crate, `kg: 12.5`, `flush: 1` → `Flush 1 · 12.5 kg today · 1 crate`; `crates: []` → `No crates today`. **HV4 links**: `V.stickerLink('http://192.168.1.20:8080', 3)` = `http://192.168.1.20:8080/#/harvest/3`; `isLocalHost`: `localhost`, `127.0.0.1`, `[::1]`, `::1` → `true`; `127.0.0.2`, `192.168.1.20`, `farm.local`, `''` → `false` | `parseKg`, `summaryText`, `stickerLink`, `isLocalHost` | C10 12.2 |
| 6 | **HV5 qrSvg** (C10 13): `qg = loadQr()`; `text = 'http://192.168.1.20:8080/#/harvest/3'`; `svg = V.qrSvg(qg, text)`; `qr = qg.QrCode.encodeText(text, qg.QrCode.Ecc.QUARTILE)`; `(svg.match(/<path/g) \|\| []).length === 1`; `svg` contains `shape-rendering="crispEdges"`, `class="st-qr"` and `viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"` (`qr.size` is 33); the number of `h1v1h-1z` in `svg` equals the number of dark modules of `qr` (count with `getModule` over `size × size`); `svg` contains `M4,4h1v1h-1z` (the top-left finder corner) | `qrSvg` | C10 12.2, 13 |
| 7 | No Node test (DOM) | `web/batches.js`: the list, tabs, new batch form, detail page (5.3) | Task 11 |
| 8 | No Node test (DOM) | `web/harvest.js`: the phone page (5.4) | Task 11 |
| 9 | No Node test (DOM) | `web/harvest.js`: the stickers page (5.5) | Task 11 |
| 10 | No Node test | `web/harvest.css` (5.6); then `npm test`, commit, tell the lead you wait for gate 2.5 | Task 11 |
| 11 | Headless Chrome, the pre-merge check (7.2), after gate 2.5 | Fix what it finds; a Node test first for any helper bug | C5 7.10 row "Harvest web", C10 13 |
| 12 | – | Section 7.1; commit; report (section 10) | – |

| Point | Rule |
|---|---|
| Test names | Start each test with its id (`test('HV5 qrSvg draws one path with crisp edges', …)`). One `test(…)` per id: BT1–BT5, HV1–HV5 |
| Zone | `process.env.TZ = 'Asia/Kuala_Lumpur'` is the first statement after the header comment and `'use strict'` in both files, before any `require` |

## 7. How to verify

### 7.1 Commands (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check web/batches.js && node --check web/harvest.js` | No output, exit 0 |
| `node --disable-warning=ExperimentalWarning --test tests/web-batches.test.js tests/web-harvest.test.js` | `# fail 0`; BT1–BT5, HV1–HV5 listed |
| `TZ=America/New_York node --disable-warning=ExperimentalWarning --test tests/web-batches.test.js tests/web-harvest.test.js` | `# fail 0` (the files set their own zone first) |
| `npm test` | `# fail 0`; `# pass` = `N0` + 10; `# skipped` = `K0` |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `tests/web-batches.test.js`, `tests/web-harvest.test.js`, `web/batches.js`, `web/harvest.css`, `web/harvest.js` |
| `grep -n "document.body\|document.getElementById\|setTimeout\|setInterval" web/batches.js web/harvest.js` | No output |
| `grep -n "innerHTML" web/batches.js web/harvest.js` | Only the template assignments of `mount` and the `.st-qrbox` line of the stickers page |
| `grep -c '^body\[data-layout="bare"\] \.bar' web/harvest.css` | `1` |
| `git diff --exit-code $(git merge-base HEAD master) -- styles.css index.html web/api.js harvest-rules.js web/vendor` | No output, exit 0 |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git status --short` | Empty |

### 7.2 Headless Chrome, the pre-merge check, after gate 2.5 (C5 7.10 row "Harvest web", C10 13; exact)

Run only when the lead says gate 2.5 passed, on the gate 2.5 tree plus your files. Its `web/shell.js` is wave 1's: it does not know the C10 routes. So the check does not use the addresses: in the page it records the modules your scripts register, loads `/web/harvest.js` and `/web/batches.js` a second time, and mounts them by hand in the emptied `#view` (a module check, not a tab check: C5 3.9's no-injection rule does not apply). For the phone page the check sets `document.body.dataset.layout = 'bare'` itself (on the final merge the shell does it; the lead's wave 3 check). Never change `location.hash` during the check: the wave 1 shell would route to `#/rooms` and empty `#view` (mount and unmount by hand instead; the module's own Delete changes the hash, so W17 checks it through the API only).

Drive Chrome with the chrome-devtools MCP tools (`resize_page` or `emulate` for 390 × 844) or with `cdp.js` of `web-split.md` Appendix A, copied into a scratch folder `S=$(mktemp -d)`. For the `127.0.0.2` rows, widen the helper's address allow-list from `127\.0\.0\.1` to `127\.0\.0\.[12]` so those requests do not count as internet.

| Step | Shell or page |
|---|---|
| Check tree | `T=$(mktemp -d); git -C <worktree> archive master \| tar -x -C $T; MB=$(git -C <worktree> merge-base HEAD master); git -C <worktree> archive HEAD -- $(git -C <worktree> diff --name-only $MB HEAD) \| tar -x -C $T` |
| Server (background) | `PORT=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"); cd $T && FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$T/check.db npm start` (keep `$PORT` for the restarts) |
| Recorder and second load (one `evaluate_script` after each page load) | See the code block below |
| Overrides | `window.confirm = () => true` |

```js
(async () => {
  const mods = {}; const reg = FarmShell.register; FarmShell.register = (n, m) => { mods[n] = m; reg(n, m); };
  for (const src of ['/web/harvest.js', '/web/batches.js']) {
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
  }
  window.__mods = mods;
  window.mountView = async (name, params) => {
    for (const m of Object.values(mods)) { try { m.unmount(); } catch {} }
    const v = document.getElementById('view'); v.replaceChildren();
    await mods[name].mount(v, params);
  };
  return Object.keys(mods).sort().join(',');       // 'batches,harvest'
})()
```

| # | Step | Expected |
|---|---|---|
| W1 | Seed one placed batch: `b1 = await FarmApi.createBatch({ crop: 'oyster', strain: 'PO-2', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: <today's farm midnight> })`; `await FarmApi.placeBatch(b1.id, { room_id: 1 })` | Both answer (201, 200); `b1.state` `received`, then `placed` |
| W2 | At 390 × 844 open `http://127.0.0.1:<PORT>/`; run the recorder; `document.body.dataset.layout = 'bare'`; `await mountView('harvest', { view: 'record', id: 1 })` | The recorder returns `batches,harvest`; `getComputedStyle(document.querySelector('.bar')).display === 'none'` (`web/harvest.css` hides it under the bare layout) |
| W3 | Read the page | `#hvRoom` `Room 1`; no `button[data-batch]` (the one batch is picked at once); `#hvPicked` names `Grey oyster · PO-2`; `#hvSummary` `No crates today` |
| W4 | `#hvKg` = `12,5`; `const b = document.getElementById('hvAdd'); b.click(); b.click();` (a double tap); wait 1 s | `(await FarmApi.getRoomHarvest(1)).batches[0].today.crates.length === 1` with `kg` 12.5; `#hvKg` empty; `#hvSummary` = `Flush 1 · 12.5 kg today · 1 crate`; `document.activeElement.id === 'hvKg'` |
| W5 | Note the `POST /api/batches/…/crates` count; `#hvKg` = `12kg`; click `#hvAdd` | `#hvMsg` = `Type the weight in kg, for example 12.5`; the count is unchanged |
| W6 | Stop the server (`SIGINT`); `#hvKg` = `3.2`; click `#hvAdd`; wait 1 s | `#hvKg.value === '3.2'` (the value stays); `#hvMsg` = `Not saved: check Wi-Fi and press Add crate again` and has the class `err` (the red line: `getComputedStyle(#hvMsg).color` is the `--critical` colour); `#hvAdd` enabled again |
| W7 | Start the server again with the same `FARM_DB` and `$PORT` (`FARM_HOST=127.0.0.1`); click `#hvAdd` | Saved: today's crates 2; `#hvSummary` `Flush 1 · 15.7 kg today · 2 crates` |
| W8 | Click the first `button[data-undo]` (confirm accepted) | Today's crates 1 (`getRoomHarvest`); `#hvToday` has one `li[data-crate]` |
| W9 | Seed a second placed batch (`b2`, crop `pink`, strain `P1`, placed in Room 1); `await mountView('harvest', { view: 'record', id: 1 })` | `#hvPick` has two `button[data-batch]`; a click on the `b2` button picks it (`#hvPicked` names `Pink oyster · P1`) and shows `#hvChange` |
| W10 | `await mountView('harvest', { view: 'record', id: 999 })` | `#view` text is only `This room does not exist or is archived.` |
| W11 | `delete document.body.dataset.layout`; at 1280 × 800 `await mountView('harvest', { view: 'stickers' })` (opened as `http://127.0.0.1:<PORT>/`) | `#stPrint.disabled === true`; `#stWarn` shown with `Open this page from the farm address (for example http://192.168.1.20:8080); phones cannot reach localhost.`; one `.st-card` per room |
| W12 | Stop the server; start it with `FARM_HOST=127.0.0.2 FARM_PORT=$PORT FARM_DB=$T/check.db npm start` (C3 2.2: never `0.0.0.0`); open `http://127.0.0.2:<PORT>/`; run the recorder; `await mountView('harvest', { view: 'stickers' })` | `#stWarn` hidden; `#stPrint` enabled; `.st-card` count `=== (await FarmApi.listRooms()).length`; each `.st-link` = `http://127.0.0.2:<PORT>/#/harvest/<id>` of its `data-room`; each card has one `svg.st-qr` with one `path`; `#stAdvice` has the two advice lines |
| W13 | `await mountView('batches', {})` | `#btTabPlaced` pressed; `#btList` has `tr[data-id]` rows for `b1` and `b2` with Room `Room 1`; `#btStickers` `href` ends `#/harvest/stickers`; `#btCrop` lists the crops with a fruiting range by name |
| W14 | In `#btForm`: `#btCrop` `pink`, `#btStrain` `P9`, `#btCount` `500`, `#btKg` `1.1`; click `#btSave` | `#btMsg` = `Saved.`; `#btTabReceived` pressed; the list shows the new batch; `(await FarmApi.listBatches({ state: 'received' }))` includes it (keep its id as `b3`) |
| W15 | Empty `#btCount`; click `#btSave` | `#btMsg` starts `Invalid batch:` and names `block_count` |
| W16 | `await mountView('batches', { id: b3 })`; pick `Room 1` in `#bdRoom`; click `#bdPlace`; then `await FarmApi.addCrate(b3, { kg: 10 })` twice; `await mountView('batches', { id: b3 })` | `#bdHead` = `Pink oyster · P9 · In Room 1`; `#bdWait` = `Received to placed: 0 days`; `#bdCrates` has two rows; `#bdFlushes` has one row (flush 1, kg 20); `#bdClear` shown, `#bdPlace` and `#bdDelete` not |
| W17 | Click a `button[data-undo]` in `#bdCrates`; then click `#bdClear` | One crate row left; then `#bdHead` ends `· Cleared` and `(await FarmApi.getBatch(b3)).state === 'cleared'` |
| W18 | `b4 = await FarmApi.createBatch({ crop: 'oyster', block_count: 10, block_wet_kg: 1, moisture_pct: 60, received_at: <today's farm midnight> })`; `await mountView('batches', { id: b4.id })`; click `#bdDelete` | `(await FarmApi.listBatches()).some(b => b.id === b4.id) === false` (the hash change afterwards lets the wave 1 shell show its own page: expected on this tree) |
| W19 | Run the recorder again if needed; `await mountView('batches', { id: 99999 })` | `#view` holds `This batch does not exist.` and a link to `#/batches` |
| W20 | The console for the whole session | No errors; no 404 except `/favicon.ico`; the failed requests of W6 (server stopped) are the only network errors |
| End | Stop the server; `rm -rf $T $S` | – |

## 8. Done when

| # | Item |
|---|---|
| 1 | Every start check of section 2 held (or the lead answered) |
| 2 | `web/batches.js` and `web/harvest.js` replace the stubs, register `batches` and `harvest`, define no global, do no DOM work at load, export exactly the C10 12.2 names for Node |
| 3 | Every helper of 5.2 behaves as its row says and is tested (BT1–BT5, HV1–HV5); the `#btCrop` options derive from `CROPS` |
| 4 | The pages use exactly the ids, texts and behaviour of C10 12.3–12.5 and 5.3–5.7; nothing touches `document.body` |
| 5 | `web/harvest.css` replaces the stub with 5.6 (prefixed classes, the bare layout rule, the print rules); `styles.css` unchanged |
| 6 | `npm test` `# fail 0` at `N0` + 10, `# skipped` `K0`; only the five owned files differ from the merge base |
| 7 | Every row W1–W20 of the pre-merge headless check passed against the gate 2.5 `master` |
| 8 | Committed on `stream/harvest-web` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit `harvest-rules.js`, `web/vendor/qrcodegen.js`, `index.html`, `web/api.js`, `web/shell.js`, `styles.css`, a server file, or any file outside section 3 | C10 2; lead decisions 60, 65 |
| Set or remove `body[data-layout]`, or touch `document.body` in a module | Lead decision 66, C5 3.1: the shell's |
| Add exports beyond C10 12.2's names, or a global | C10 12.2, C5 1.4 |
| `require` `web/vendor/qrcodegen.js` in a test (it defines no CommonJS export) or edit it | C5 1.4: load it with `node:vm` |
| Validate batches or crates in the page beyond `parseKg` (the server answers with `checkBatch`, `checkCrate`) | C10 9; one rule set in `harvest-rules.js` |
| Retry a failed crate save by itself, or clear the field on a failure | C10 12.4: the value stays, the farmer presses again |
| Use the browser's time zone for farm dates | C10 12.2, lead decision 67 |
| Put a room name, a batch text or server text into `innerHTML` | C5 1.4 (the QR string of `qrSvg` holds only numbers and fixed text) |
| Check the addresses `#/batches`, `#/harvest/…` through the shell and report them as yours | The lead's wave 3 check (C5 7.10, C10 13) |
| Push, merge, rebase, merge `master` into your branch, or change git config | The lead merges after review |

## 10. Report to the lead

| Item | Content |
|---|---|
| Result | Done or blocked; `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | `N0`, `K0`, the final `npm test` counts; the `TZ=America/New_York` run |
| Headless | One line per row W1–W20: pass or fail, with what you saw |
| Points to confirm | (1) the `batchBody` argument shape `{ edit, fields }` (C10 12.2 names one argument `form`); (2) the `#btCrop` test through a recording DOM stub (C10 13 asks for a Node test; the export list has no helper for it); (3) the SVG layout of `qrSvg` (white `rect`, one `path` of unit squares); (4) the extra ids and texts of 5.3–5.5 (`#bdCrop` … `#bdReceived`, `#hvPicked`, the confirm texts, `Saved.`, the head texts `In <room>` / `Received` / `Cleared`); (5) the `innerHTML` of the QR box |
| Anything else | Every contract gap or mismatch you met, and what you did instead of guessing |

# Batches and harvest by room QR: design

Date: 2026-10-09. Status: approved in brainstorming; to be written as contract C10 (`docs/contracts/harvest.md`) and built as its own wave after C9 (air exchange) and wave 2 have merged.

## Purpose

A worker scans a QR sticker on the room door with their phone, picks the batch, and records each crate's weight as it comes off the scale. The office records batches of bought blocks. The app shows kg, g per block and biological efficiency (BE) per flush and per batch.

| Goal | Result |
|---|---|
| Record harvest at the door | One scan, one number, **Add crate**; no app install, no login |
| Yield per batch | kg, g per block and BE % per flush and in total |
| Basis for later parts | Economics, predicted vs real, contamination, inventory and MyGAP read these records |

## Decisions

| Subject | Decision |
|---|---|
| What a harvest belongs to | A batch (a lot of blocks), not just a room |
| QR target | One sticker per room; the phone page lists the room's placed batches. A lone batch is picked automatically. |
| Weighing | Crate by crate; each crate is one record; Undo per crate |
| Flushes | Worked out from the crate times: a gap of at least `flush_gap_days` with no crate starts a new flush. Never stored. |
| Yield figures | g per block and BE % (needs block wet weight and moisture %) |
| Blocks | Bought already colonised; one room for the batch's life. A gap between delivery and placing in the room is normal. |
| Network | Phones join the farm Wi-Fi, which reaches the room doors. No offline queue. |
| QR code generation | Vendored Nayuki "QR Code generator" (MIT, one plain-JS file, no dependencies) in `web/vendor/`; SVG output |
| Build order | Spec now; built after wave 2, ahead of Economics and Real hardware on the roadmap |

### Out of scope

| Left out | Where it goes |
|---|---|
| Inventory (block stock, packaging, crates) | Inventory part; links a purchase to a batch through one new column |
| Making blocks (recipe, sterilisation, spawn, inoculation, spawn run, room moves) | Substrate and spawn part; a home-made lot arrives here as a **Received** batch once colonised |
| Contamination losses | Contamination part |
| Grading (A / B / reject) | Later; one optional column on the crate |
| Login, workers, tasks | Workers and login part; until then `picker` is free text |
| Sales, stock out | Sales part |
| Offline queue on the phone | Not needed: Wi-Fi reaches the doors |
| CSV export | Later, with MyGAP |
| Batches driving the controller stage or the capacity check | Later; the foundation spec listed it under "Batches and stages", this spec does not do it |

## 1. Data model

Two new tables, added by one schema upgrade (the next free C1 upgrade number at build time). Times are integer seconds since 1970 UTC, as everywhere in C1. Date-only fields (received, placed, cleared, spawn) store local midnight of the farm device.

### 1.1 `batches`

| Column | Type | Required | Rule |
|---|---|---|---|
| `id` | integer | yes | `INTEGER PRIMARY KEY` |
| `crop` | text | yes | a key of `ClimateController.CROPS` |
| `strain` | text | no | for example "LM-01 from supplier X"; ≤ 80 characters |
| `source` | text | no | supplier name, or "own" for farm-made blocks; ≤ 80 characters |
| `block_count` | integer | yes | 1 to 1,000,000 |
| `block_wet_kg` | real | yes | > 0 and ≤ 20, weight of one block as received |
| `moisture_pct` | real | yes | ≥ 0 and < 100; default 60 in the form |
| `spawn_date` | integer | no | the supplier's spawn date |
| `received_at` | integer | yes | date the blocks were delivered or made |
| `room_id` | integer | no | foreign key to `rooms`; empty until placed, fixed afterwards |
| `placed_at` | integer | no | set together with `room_id`; ≥ `received_at` |
| `cleared_at` | integer | no | only when placed; ≥ `placed_at` |
| `flush_gap_days` | integer | yes | 1 to 60; default 5 |
| `notes` | text | no | ≤ 2000 characters |
| `created_at` | integer | yes | set by db.js |

SQL `CHECK`s: `(room_id IS NULL) = (placed_at IS NULL)`, `cleared_at IS NULL OR placed_at IS NOT NULL`, and the date orders above.

### 1.2 `harvest_crates`

| Column | Type | Required | Rule |
|---|---|---|---|
| `id` | integer | yes | `INTEGER PRIMARY KEY` |
| `batch_id` | integer | yes | foreign key to `batches` |
| `t` | integer | yes | time saved, set by the server |
| `kg` | real | yes | ≥ 0.01 and ≤ 50 (catches 125 typed for 12.5) |
| `picker` | text | no | name typed on the phone, ≤ 40 characters |
| `deleted_at` | integer | no | set by Undo; the row stays for the record |

Index on `(batch_id, t)`.

### 1.3 Batch states

| State | Condition | Shown in the room's QR picker | Crates can be added |
|---|---|---|---|
| Received | `room_id` empty | no | no |
| Placed | `room_id` set, `cleared_at` empty | yes | yes |
| Cleared | `cleared_at` set | no | no |

## 2. Yield rules (`harvest-rules.js`)

A pure module at the repo root (like `room-rules.js`), loaded by the server and the browser. Deleted crates are never counted.

| Function | Returns |
|---|---|
| `state(batch)` | `received`, `placed` or `cleared` (section 1.3) |
| `drySubstrateKg(batch)` | `block_count × block_wet_kg × (1 − moisture_pct / 100)` |
| `flushes(batch, crates)` | Crates sorted by `t`; a new flush starts when the time since the previous crate is ≥ `flush_gap_days × 86400`. One entry per flush: `{ n, from, to, crates, kg, g_per_block, be_pct }` |
| `totals(batch, crates)` | `{ crates, kg, g_per_block, be_pct, flushes }` |
| `checkBatch(fields, partial?)` | List of field errors (same shape as `room-rules.js` `check*`) |
| `checkCrate(fields)` | List of field errors |

| Figure | Formula |
|---|---|
| g per block | `kg × 1000 / block_count` |
| BE % | `kg / drySubstrateKg × 100` |

When the flush grouping is wrong, the office changes the batch's `flush_gap_days`; single crates are not edited.

## 3. API (amendment to C3)

| Route | Body | Does | Errors |
|---|---|---|---|
| `GET /api/batches?state=&room=` | – | Batches, each with `totals` | 400 bad query |
| `POST /api/batches` | batch fields | Create a Received batch | 400 |
| `GET /api/batches/:id` | – | Batch, `flushes`, `totals` | 404 |
| `PATCH /api/batches/:id` | editable fields | Edit `crop`, `strain`, `source`, `block_count`, `block_wet_kg`, `moisture_pct`, `spawn_date`, `received_at`, `flush_gap_days`, `notes` | 400, 404 |
| `POST /api/batches/:id/place` | `{ room_id, placed_at? }` | Place in a room (not archived) | 400, 404, 409 already placed |
| `POST /api/batches/:id/clear` | `{ cleared_at? }` | Clear | 404, 409 not placed or already cleared |
| `DELETE /api/batches/:id` | – | Delete | 404, 409 has crates |
| `GET /api/rooms/:id/harvest` | – | For the phone, in one call: room name, placed batches, today's crates per batch (local day of the farm device) and the current flush number | 404 unknown or archived room |
| `POST /api/batches/:id/crates` | `{ kg, picker? }` | Add a crate; returns the crate and the batch's new `totals` | 400 kg outside 0.01–50, 404, 409 batch not placed or cleared |
| `DELETE /api/crates/:id` | – | Undo: sets `deleted_at` | 404, 409 already deleted |

The live feed (C4) is not changed.

## 4. Web pages (amendment to the web contract)

| Route | Module | Shows |
|---|---|---|
| `#/batches` | `web/batches.js` | Tabs **Received**, **In rooms**, **Cleared**; **New batch** form; rows with crop, strain, room, age, kg, g per block, BE %; **Print QR stickers** |
| `#/batches/:id` | `web/batches.js` | Editable details; **Place in room**, **Clear**, **Delete** (no crates only); days from received to placed; flush table (flush, first and last date, kg, g per block, BE %); crate list with time, kg, picker and Undo |
| `#/harvest/stickers` | `web/harvest.js` | One sticker per room that is not archived |
| `#/harvest/:id` | `web/harvest.js` | The phone page; the shell hides the top menu on this route |

The menu gets a **Batches** entry.

### 4.1 Stickers

| Item | Design |
|---|---|
| Link | `<page origin>/#/harvest/<roomId>`; room ids never change |
| Card | Room name in large type, the QR, the link written out, "Scan to record harvest" |
| QR | Nayuki generator, error correction **Q** (reads with 25 % of the code dirty or wet), drawn as SVG |
| Print | A4, 6 cards per page, about 8 cm wide; menu and buttons hidden by print CSS |
| Address check | Origin host `localhost`, `127.0.0.1` or `::1`: the page says "Open this page from the farm address (http://192.168.…), phones can't reach localhost" and **Print** is disabled |
| Advice on the page | Laminate or use waterproof labels (rooms run at 90 % RH). Give the farm device a fixed address on the router, or every sticker breaks when its address changes. |

### 4.2 Phone page

Mobile-first, large tap targets for gloved, wet hands.

| Step | Screen |
|---|---|
| 1. Open | Room name. One placed batch: picked automatically. Several: one large button each (crop, strain, placed date). None: "No batch in this room. Ask the office to place one." |
| 2. Name | First time only: "Your name" (optional), kept in the phone's `localStorage` |
| 3. Weigh | Large kg field (`inputmode="decimal"`), large **Add crate**; disabled while saving so a double tap saves once |
| 4. Saved | The crate tops today's list for this batch, with "Flush 2 · 14.6 kg today · 5 crates" |
| 5. Mistake | Each of today's crates has **Undo** with a confirm |

| Case | Behaviour |
|---|---|
| Save fails (Wi-Fi drop, server down) | The value stays in the field; red line "Not saved: check Wi-Fi and press Add crate again" |
| kg empty, 0, over 50, not a number | The server's 400 message is shown, naming the range "0.01 to 50 kg" |
| Unknown or archived room | "This room does not exist or is archived." |
| Batch cleared while the page is open | "This batch was cleared"; the page reloads the batch list |

## 5. Tests

| Level | File | Covers |
|---|---|---|
| Rules | `tests/harvest-rules.test.js` | Dry substrate; flush split exactly at the gap and just under it; deleted crates ignored; batch with no crates; `check*` errors |
| Database | `tests/db.test.js`, `tests/fake-db.test.js` | Upgrade from the previous version; `CHECK`s (kg range, date order, placed pair); the fake matches the real db |
| API | `tests/api.test.js` | Every route, including 400, 404 and 409 |
| Web | `tests/web-harvest.test.js`, `tests/web-batches.test.js` | Phone page: auto-pick, picker, double-tap guard, value kept after a failed save, cleared batch; stickers: Print disabled on localhost; QR output equals a known test vector from the Nayuki project |
| Real | – | Headless Chrome at phone size 390 × 844; then a printed sticker scanned with a real phone on the farm Wi-Fi |

## 6. Contracts and build

| Item | Plan |
|---|---|
| New contract | C10 `docs/contracts/harvest.md`: tables and upgrade, `harvest-rules.js`, routes, pages |
| Amendments | C1 (two tables, db functions, fake), C3 (routes, static file `harvest-rules.js`, `web/vendor/qrcodegen.js`), web contract (routes, menu entry, bare layout on `#/harvest/:id`) |
| Streams | Data (db, fake), Rules (`harvest-rules.js`), API, Web (batches, harvest, stickers); lead integrates |
| When | After C9 and wave 2 merge; takes the next free db upgrade number |

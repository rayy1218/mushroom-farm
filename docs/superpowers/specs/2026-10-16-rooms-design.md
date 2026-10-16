# Rooms: create and list (v2 iteration 1)

Date: 2026-10-16
Branch: `v2` (orphan; the previous app stays on `master` for reference)

## 1. Goal

Restart the farm app small. Iteration 1 has one feature: keep a list of grow rooms. A user can add, list, edit and delete rooms. Nothing else (no climate, simulation, batches or harvest).

## 2. Stack

| Layer | Choice |
|---|---|
| Server | Node 22.13+, `node:http`, no npm dependencies |
| Database | built-in `node:sqlite`, STRICT tables |
| Browser | plain HTML, CSS and JS modules, no build step, served by the Node server |
| Tests | `node --test` |

## 3. Process

| Rule | Detail |
|---|---|
| Plan | one implementation plan for the whole iteration; no contracts, streams or lead decisions |
| Tests | test-first for every server module |
| Browser check | headless Chrome run of the page before calling the iteration done |

## 4. Data

One table, `rooms`. Volume is computed when read, never stored.

| Column | Type | Rule |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | assigned by SQLite |
| `name` | TEXT NOT NULL | trimmed; 1–60 characters; unique ignoring case (`COLLATE NOCASE` + UNIQUE) |
| `length_m` | REAL NOT NULL | 0.5–100 |
| `width_m` | REAL NOT NULL | 0.5–100 |
| `height_m` | REAL NOT NULL | 0.5–10 |
| `created_at` | INTEGER NOT NULL | Unix milliseconds |
| `updated_at` | INTEGER NOT NULL | Unix milliseconds; equals `created_at` until the first edit |

| Behaviour | Decision |
|---|---|
| Delete | hard delete (`DELETE FROM rooms`); nothing references rooms yet |
| Database file | `data/v2.db` by default (the `data/` folder is git-ignored; the old app's `data/farm.db` is never opened) |
| Configuration | env `FARM_DB` (database path, `:memory:` allowed) and `FARM_PORT` (default 8080) |

## 5. Validation

The server is the authority. The browser repeats the same limits as input attributes for quick feedback.

| Input | Rule | Error message (`field`) |
|---|---|---|
| body | must be a JSON object | "Body must be a JSON object" (none) |
| `name` | string; trimmed; 1–60 characters after trimming | "Name is required" / "Name must be 60 characters or fewer" (`name`) |
| `name` | not used by another room, ignoring case | "A room called "<name>" already exists" (`name`) |
| `length` | finite number, 0.5–100 | "Length must be a number from 0.5 to 100 m" (`length`) |
| `width` | finite number, 0.5–100 | "Width must be a number from 0.5 to 100 m" (`width`) |
| `height` | finite number, 0.5–10 | "Height must be a number from 0.5 to 10 m" (`height`) |

Numeric strings such as `"4"` are rejected: the API takes JSON numbers only. Unknown body keys are ignored. Validation stops at the first failing field, in the order name, length, width, height.

## 6. API

JSON in and out. Lengths are metres, volume is cubic metres rounded to 2 decimals, times are Unix milliseconds.

Room object: `{ id, name, length, width, height, volume, createdAt, updatedAt }`.

| Method and path | Success | Errors |
|---|---|---|
| `GET /api/rooms` | 200, array of rooms sorted by name (case-insensitive) | — |
| `POST /api/rooms` | 201, the new room | 400 invalid input or bad JSON; 409 name taken; 413 body over 64 KB |
| `PUT /api/rooms/:id` | 200, the updated room (all four fields required) | 404 no such room (checked first); 400; 409 name taken by another room; 413 |
| `DELETE /api/rooms/:id` | 204, empty body | 404 no such room |
| any other `/api/...` path or method | — | 404 |
| unexpected server failure | — | 500 "Something went wrong" (details logged on the server only) |

Every error body is `{ "error": "<message>", "field": "<field>" }`; `field` is present only when one input caused the error. An `:id` that is not a positive whole number gets 404.

## 7. Static files

| Path | Serves |
|---|---|
| `/` | `web/index.html` |
| `/app.js`, `/styles.css` | the matching file in `web/` |
| anything else outside `/api` | 404 plain text |

Only files directly in `web/` are served; paths with `..` or subfolders get 404.

## 8. Page

One screen at `/`.

| Element | Behaviour |
|---|---|
| Header | title "Rooms" and an **Add room** button |
| Table | columns Name, Size (L × W × H m), Volume (m³), Created (date), and Edit / Delete buttons; sorted by name |
| Narrow screens (≤ 600 px) | each row shows as a stacked card |
| Empty state | "No rooms yet" and an **Add room** button |
| Add / Edit dialog | one `<dialog>` form: Name, Length, Width, Height (number inputs, step 0.1), a live "Volume: 48.0 m³" line, **Save** and **Cancel**; title "Add room" or "Edit room" |
| Delete | confirm dialog "Delete <name>? This can't be undone." with **Delete** and **Cancel** |
| After a save or delete | the list reloads from the server |

## 9. Errors on the page

| Case | What the user sees |
|---|---|
| 400 or 409 with `field` | message under that field; dialog stays open with the input kept |
| 400 without `field` | message at the top of the dialog |
| 404 on edit or delete | banner "That room no longer exists"; dialog closes; list reloads |
| network failure or 5xx while saving | message at the top of the dialog "Couldn't reach the farm server. Try again."; input kept |
| network failure or 5xx on load or delete | banner "Couldn't reach the farm server" with a **Retry** button that reloads the list |
| opening a dialog | hides any banner |

## 10. Files

| File | Job |
|---|---|
| `package.json` | `start` and `test` scripts; `engines.node >= 22.13` |
| `server/main.js` | read env, open the database, start the HTTP server |
| `server/db.js` | open a database, create the schema, room queries (create, list, get, update, delete) |
| `server/rooms.js` | pure validation: input → clean room fields or `{ error, field }` |
| `server/api.js` | route `/api/rooms…` to handlers; JSON parsing; status codes |
| `server/app.js` | the HTTP server: sends `/api…` to the API and everything else to the static files |
| `server/static.js` | serve files from `web/` |
| `web/index.html` | page markup, including both dialogs |
| `web/app.js` | fetch rooms, render the table, run the dialogs |
| `web/styles.css` | page styles, narrow-screen cards |

## 11. Tests

| Test file | Covers |
|---|---|
| `tests/rooms.test.js` | every rule in section 5, including boundaries (0.5, 100, 10, 60 characters), trimming, strings for numbers, `NaN`/`Infinity`, missing fields |
| `tests/db.test.js` | `:memory:` database: create, list order, get, update (`updated_at` changes), delete, case-insensitive uniqueness, missing ids |
| `tests/api.test.js` | real server on port 0 with a `:memory:` database: every row of the section 6 table, bad JSON, bad ids, unknown routes |
| `tests/static.test.js` | static paths, content types, HEAD, other methods, subfolders and `..` |
| `tests/main.test.js` | the start script: `FARM_PORT`/`FARM_DB`, creates the database folder, clean exit on SIGINT, bad port message |
| Browser check | headless Chrome: add a room, edit it, duplicate-name error under the field, delete with confirm, empty state, 375 px width shows cards |

## 12. Out of scope

Climate control, simulation, crops, batches, harvest, users and login, room archive or undo, pagination, search.

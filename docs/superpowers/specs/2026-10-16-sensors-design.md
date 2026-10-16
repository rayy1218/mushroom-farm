# Sensors, room detail page and device app (v2 iteration 2)

Date: 2026-10-16
Branch: `v2`
Builds on: `docs/superpowers/specs/2026-10-16-rooms-design.md` (iteration 1: rooms list, add, edit, delete)

## 1. Goal

| Want | Meaning |
|---|---|
| Read real-style sensors | The farm app polls temperature/humidity and CO₂ sensors over **Modbus TCP**, exactly as it would poll a real Ethernet-to-RS-485 gateway |
| Room detail page | Shows the room's size, each sensor's status (online / timeout / offline) and its last 50 readings as graphs |
| Device app | A separate small program that pretends to be the gateway and its sensors; the owner types the values and switches sensors off to cause timeouts |
| App layout | The farm app gets the previous app's layout (side bar, top bar, page head) with **Rooms** as the only menu entry |

Out of scope: controlling machines (relays, aircon), alarms, value simulation or physics in the device app, history beyond the last 50 readings on screen, more than one gateway.

## 2. How a real farm reads sensors (background for the design)

| Fact | Consequence here |
|---|---|
| Sensors share one RS-485 bus behind one gateway; each has an address 1–247 set by the installer | One gateway per farm (`FARM_GATEWAY`); each room stores its sensors' addresses |
| Sensors only answer when asked | The farm app polls; the device app never sends anything by itself |
| Values are scaled integers in registers | Register map in section 3 |
| A dead or missing sensor does not answer | The device app stays silent; the farm app times out |

## 3. Sensors and register map

Each room has up to two sensors.

| Kind (`kind`) | Hardware it imitates | Request | Reply registers | Example |
|---|---|---|---|---|
| `trh` | T/RH probe (XY-MD02 style) | function 04 (read input registers), start address 1, quantity 2 | `[T × 10 as signed 16-bit, RH × 10]` | `[265, 881]` → 26.5 °C, 88.1 %RH |
| `co2` | NDIR CO₂ sensor | function 03 (read holding registers), start address 0, quantity 1 | `[ppm]` | `[950]` → 950 ppm |

Modbus TCP frame (both directions): 7-byte MBAP header (transaction id 2 bytes, protocol id 0 2 bytes, length 2 bytes = bytes that follow, unit id 1 byte) then the PDU. All numbers big-endian.

| PDU | Bytes |
|---|---|
| Request (03 / 04) | function, start (2), quantity (2) |
| Normal reply | function, byte count (= 2 × quantity), registers (2 each) |
| Error reply | function + 0x80, exception code (1 = illegal function, 2 = illegal data address) |

## 4. Room fields

| Field (API) | Column | Rule |
|---|---|---|
| `trhAddress` | `trh_address INTEGER` | whole number 1–247, or `null` / missing = not wired |
| `co2Address` | `co2_address INTEGER` | same |

| Rule | Error (400 / 409, `field` = the address field) |
|---|---|
| not a whole number 1–247 or null | 400 "T/RH sensor address must be a whole number from 1 to 247" / "CO₂ sensor address must be a whole number from 1 to 247" |
| both addresses of one room equal | 400 "The two sensors need different addresses" (`field` = `co2Address`) |
| address already used by any sensor of another room | 409 "Address <n> is already used by <room name>" |

Validation order: name, length, width, height, trhAddress, co2Address, then the same-room check. `POST` and `PUT` both accept the fields; on `PUT` a missing field means `null`.

## 5. Database

`PRAGMA user_version` tracks the schema. Iteration 1 databases (including the owner's `data/v2.db`) are version 0.

| Upgrade | Change |
|---|---|
| 0 → 1 | `ALTER TABLE rooms ADD COLUMN trh_address INTEGER CHECK (trh_address BETWEEN 1 AND 247)`; same for `co2_address`; create `readings`; set `user_version = 1`. Runs in one transaction. A new database is created at version 1 directly. |

`readings` (STRICT):

| Column | Type | Meaning |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | |
| `room_id` | INTEGER NOT NULL | room |
| `kind` | TEXT NOT NULL CHECK IN ('trh','co2') | which sensor |
| `address` | INTEGER NOT NULL | address polled |
| `at` | INTEGER NOT NULL | Unix ms when the poll started |
| `ok` | INTEGER NOT NULL (0/1) | answered correctly |
| `t`, `rh`, `co2` | REAL, null when not measured or failed | values in °C, %RH, ppm |
| `error` | TEXT, null when ok | `timeout`, `no connection`, `exception <code>`, `bad reply` |

Indexes `readings_by_sensor (room_id, kind, address, id)` and the partial `readings_ok (room_id, kind, address, id) WHERE ok = 1`, so the status queries (latest, last ok, failures since the last ok) search an index and never scan history; the failure count stops at 10 000. A reading is stored only while the room still has that address for that kind. Deleting a room deletes its readings in the same transaction. Readings are kept (no trimming); at 2 sensors × one poll per 5 s that is ~35 000 rows per room per day.

## 6. Polling (farm app)

| Rule | Value |
|---|---|
| Gateway | env `FARM_GATEWAY` = `host:port`, default `127.0.0.1:1502` |
| Cycle | every 5 s: poll every wired sensor of every room, one request at a time (rooms by id, `trh` before `co2`). A cycle that is still running when the next is due delays it (no overlap). |
| Request timeout | 1 s from sending the request |
| Connection | one TCP connection kept open; if it is down, each poll first tries to connect (1 s timeout); a failed connect is a failed poll with error `no connection` |
| Late replies | a reply whose transaction id is not the request in flight is dropped |
| Each poll | one row in `readings`, ok or failed |
| Start and stop | starts with the server; stops with it (no poll after the database closes) |

Sensor status, from the polls of the room's **current** address for that kind (most recent first):

| Status | When |
|---|---|
| `not-wired` | the room has no address for that kind |
| `no-data` | wired, no reading for that address yet |
| `online` | the latest poll is ok |
| `timeout` | the latest 1 or 2 polls failed |
| `offline` | the latest 3 or more polls failed |

## 7. API additions

| Method and path | Success | Errors |
|---|---|---|
| `GET /api/rooms/:id` | 200, the room | 404 |
| `GET /api/rooms/:id/sensors` | 200, array of 2 sensor objects, `trh` first | 404 |
| `POST` / `PUT /api/rooms…` | as iteration 1, plus `trhAddress` / `co2Address` (section 4) | as iteration 1, plus section 4 |

Room objects everywhere now include `trhAddress` and `co2Address` (number or null).

Sensor object:

| Field | Meaning |
|---|---|
| `kind` | `trh` or `co2` |
| `address` | number or null |
| `status` | section 6 |
| `failuresInRow` | consecutive failed polls, latest first (0 when online or no data) |
| `lastOk` | latest ok reading `{ at, t, rh }` or `{ at, co2 }`, or null |
| `readings` | the latest 50 polls for that address, oldest first: `{ at, ok, t, rh }` or `{ at, ok, co2 }` (values null when not ok) |

## 8. App layout (farm app)

Copied from the previous app (`master`: `index.html` shell, `styles.css` "App shell" block), reduced to one section.

| Screen | Layout |
|---|---|
| ≥ 900 px | left side bar 232 px: brand mark + "Mushroom farm", menu with **Rooms** (house icon, `aria-current="page"` on the list and detail pages), Light/Dark button at the bottom |
| < 900 px | sticky top bar: brand + Light/Dark button; no bottom tab bar while there is only one section |
| Content | page head (title, sub line, actions) then the page |

Routes (hash): `#/rooms` (list, also the default for an empty or unknown hash) and `#/rooms/<id>` (detail).

## 9. Room list changes

| Change | Detail |
|---|---|
| Name | a link to `#/rooms/<id>` |
| Add / Edit dialog | adds a "Sensors (Modbus address)" group: T/RH and CO₂ number inputs, 1–247, optional |

## 10. Room detail page

| Element | Behaviour |
|---|---|
| Head | "← Rooms" link, room name, sub line "L × W × H m · V m³", Edit button (same dialog as the list) |
| Sensor cards | one per kind: title ("T/RH probe" / "CO₂ sensor"), "address n", status as coloured dot **and** word, latest values and "n s ago"; when not online also "last answer hh:mm:ss" (or "never") and "n failed polls in a row"; not wired: "No sensor address set" and an Edit button |
| Graphs | Temperature (°C), Humidity (%RH), CO₂ (ppm); each shows that sensor's latest 50 polls; x = time, y = value with min/max labels; the line breaks at failed polls; pointer/touch shows time and value of the nearest point; hidden when the sensor is not wired; "No readings yet" when there are none |
| Drawing | inline SVG, no library; drawn at the element's real width (ResizeObserver) so text keeps its size on a phone |
| Refresh | every 5 s while the page is shown; stops when leaving the page (per-mount token: a reply that arrives after leaving or after switching to another room is ignored) |
| Room missing | "That room no longer exists" with a link to the list |
| Errors | server unreachable: the existing offline banner with Retry; the page keeps the last data |

## 11. Device app

A separate program in `device/`, started with `npm run device`. It shares no code with the farm app (so a bug in one Modbus implementation cannot hide in both).

| Part | Behaviour |
|---|---|
| Modbus side | TCP server on `DEVICE_MODBUS_PORT` (default 1502); handles several requests in one data chunk and requests split over chunks |
| Answers | known address, answering on, right kind: normal reply from the stored values (section 3) |
| | known address, answering off: no reply (the farm app times out) |
| | unknown address: no reply |
| | known address, function not 03/04 or not the kind's function: exception 1; right function but wrong start/quantity: exception 2 |
| | malformed frame (protocol id not 0, length wrong): connection closed |
| Control page | `http://localhost:<DEVICE_HTTP_PORT>` (default 8090), same dark/light theme tokens, no side bar |
| Sensor list | per sensor: address, kind, value inputs (T °C and RH %, or CO₂ ppm), answering on/off switch, Remove; "Add sensor" form (address 1–247 unique, kind) |
| Value limits | T −40 to 80 °C (0.1 steps), RH 0–100 % (0.1), CO₂ 0–10 000 ppm (whole) |
| New sensor defaults | T 25.0, RH 85.0, CO₂ 800, answering on |
| Request log | the latest 20 requests: time, address, function, answered / ignored / exception |
| State | sensors saved to `DEVICE_STATE` (default `device/state.json`, git-ignored) on every change, loaded at start |
| Control API | `GET /api/sensors`, `POST /api/sensors {address, kind}`, `PUT /api/sensors/:address {t, rh}` or `{co2}` and/or `{answering}`, `DELETE /api/sensors/:address`, `GET /api/log`; JSON; 400 / 404 / 409 like the farm API |
| Page refresh | log and list every 2 s |

## 12. Files

| File | Job |
|---|---|
| `server/modbus.js` | Modbus TCP client: connect, one request in flight, read registers, timeouts, typed errors |
| `server/poller.js` | the 5 s cycle; turns replies into readings; writes them |
| `server/db.js` | upgrade 0 → 1, address columns, readings insert/query, sensor status |
| `server/rooms.js` | address validation |
| `server/api.js` | new routes and fields |
| `server/main.js` | `FARM_GATEWAY`; start/stop the poller |
| `web/index.html`, `web/styles.css` | app shell, list, detail, dialog |
| `web/app.js` | shell: theme, router, mounting pages |
| `web/api.js` | `request()` and `ApiError` shared by pages |
| `web/rooms-list.js`, `web/room-detail.js`, `web/room-dialog.js`, `web/chart.js` | the pages, the shared Add/Edit dialog, the SVG line chart |
| `device/main.js`, `device/modbus-server.js`, `device/sensors.js`, `device/http.js`, `device/web/index.html`, `device/web/app.js`, `device/web/styles.css` | the device app |
| `package.json` | new script `"device": "node device/main.js"`; device tests live in `tests/` named `device-*.test.js`, so `npm test` runs them |
| `.gitignore` | adds `device/state.json` |

## 13. Tests

| Area | Covers |
|---|---|
| Modbus client | request bytes for 03 and 04; parsing replies; signed temperature; exception replies; 1 s timeout; late reply after timeout dropped; reply split over chunks; connection refused; reconnect after the server closes |
| Device Modbus server | every answer rule in section 11 with raw sockets; two requests in one chunk |
| Device control API and state file | add, update, remove, duplicate address 409, limits, state saved and reloaded |
| Poller | one cycle writes one reading per wired sensor; failure kinds; no overlap; stop |
| Status | not-wired, no-data, online, timeout (1, 2), offline (3+); address change starts fresh |
| Database | upgrade of an iteration 1 database file keeps its rooms; delete room removes readings |
| API | address validation and 409, `GET /api/rooms/:id`, `/sensors` shape, 50 limit and order |
| End to end | farm poller against the real device app on port 0: online, switch answering off → timeout → offline after 3 polls, back on → online |
| Browser | layout at 1280 and 375 px both themes; list name links; detail cards and graphs with gaps; device app page; stop the device app → all sensors go timeout then offline |

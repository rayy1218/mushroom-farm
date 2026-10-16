# Machines: relay module, aircon gateway, manual control (v2 iteration 3)

Date: 2026-10-16 · Branch `v2` · Builds on `2026-10-16-sensors-design.md` (iteration 2).

## 1. Goal

| Want | Meaning |
|---|---|
| Machines per room | intake fan, exhaust fan, circulation fan, humidifier (on/off relays) and one aircon |
| Three states per machine | **commanded** (what the farm app last sent), **reported** (what the relay module / AC gateway says), **running** (the relay module's current-switch input, relays only) |
| Manual control | switch each relay machine and set the aircon from the room page |
| Faults to play with | the device app can make relays stick, motors die, the AC refuse commands or show an error |

Out of scope (owner: "don't do the update function"): any automatic control rule, alarms, command history, automatic re-sending.

## 2. Wire format (Modbus TCP, as I1 of iteration 2)

New functions: 01 read coils, 02 read discrete inputs, 05 write single coil, 16 (0x10) write multiple registers. Exception 3 = illegal data value.

| Device (`kind`) | Read | Write |
|---|---|---|
| Relay module (`relay`) | fn 01 start 0 qty 4 → coils (relay states); fn 02 start 0 qty 4 → inputs (current switches, 1 = running) | fn 05 address 0–3, value `0xFF00` on / `0x0000` off (reply echoes the request) |
| Aircon gateway (`ac`) | fn 03 start 0 qty 4 → `[power 0/1, mode, setpoint × 10, fan]`; fn 04 start 0 qty 2 → `[room T × 10 (int16), error code]` | fn 16 start 0 qty 4, byte count 8, same 4 values (reply: fn, start, qty) |

| Output / input | Machine (`key`) |
|---|---|
| 0 | intake fan (`intake`) |
| 1 | exhaust fan (`exhaust`) |
| 2 | circulation fan (`circulation`) |
| 3 | humidifier (`humidifier`) |

| AC value | Codes |
|---|---|
| mode | 0 `cool`, 1 `heat`, 2 `dry`, 3 `fan` |
| fan | 0 `auto`, 1 `low`, 2 `high` |
| setpoint | 16.0–30.0 °C in 0.5 steps (register 160–300) |

Bit packing for fn 01/02 replies: byte count 1, bit 0 = coil/input 0 … bit 3 = 3.

## 3. Device app additions

| Item | Behaviour |
|---|---|
| New kinds | `relay` and `ac`, added like sensors (address 1–247, unique across all device kinds) |
| Relay state | per output: `coil` (set by fn 05), `stuck` (fn 05 is acknowledged but the coil does not change), `dead` (the current switch reads 0 even when the coil is on); `running` = coil on, not dead, and on for ≥ 2 s (spin-up) |
| AC state | `power, mode, setpoint, fan` (set by fn 16), `roomT` (typed, default 25.0), `error` (typed 0–255, default 0), `refuse` (fn 16 is acknowledged but nothing changes) |
| Bad values | fn 05 value not 0xFF00/0x0000 → exception 3; fn 16 with power > 1, mode > 3, fan > 2, setpoint outside 160–300 or not a multiple of 5 → exception 3; wrong function for the kind → 1; wrong start/qty → 2 |
| Answering off | silence, as for sensors |
| Control page | relay module: 4 rows (machine name, coil on/off as commanded by the farm, running dot, Stuck switch, Dead switch); AC: current power/mode/setpoint/fan (read-only, set by the farm), room T input, error input, Refuse switch; both with answering switch and Remove |
| State file | relay/AC state saved like sensors (coils and AC settings included) |
| Log | writes appear in the request log as `write coil 1 on`, `write ac cool 23.5 auto on` |

## 4. Farm app

### 4.1 Room fields and storage

| Field | Rule |
|---|---|
| `relayAddress`, `acAddress` | whole number 1–247 or null; all four room addresses (T/RH, CO₂, relay, AC) unique within the room and across rooms (409 "Address n is already used by <room>"); messages "Relay module address must be …", "Aircon gateway address must be …" |

Upgrade 1 → 2 (`PRAGMA user_version`): `rooms` gets `relay_address`, `ac_address` (INTEGER, CHECK 1–247); new table `machine_commands (room_id INTEGER PRIMARY KEY, intake, exhaust, circulation, humidifier INTEGER NOT NULL DEFAULT 0, ac_power INTEGER NOT NULL DEFAULT 0, ac_mode TEXT NOT NULL DEFAULT 'cool', ac_setpoint REAL NOT NULL DEFAULT 25, ac_fan TEXT NOT NULL DEFAULT 'auto', relay_sent_at INTEGER, ac_sent_at INTEGER)` STRICT; a row is created with the room (and for existing rooms by the upgrade); deleted with the room.

### 4.2 Polling

In the same 5 s cycle, after the room's sensors: relay module → fn 01 then fn 02; AC → fn 03 then fn 04. Results are kept **in memory only** (the last 2 polls per device: `{ at, ok, coils, inputs }` / `{ at, ok, power, mode, setpoint, fan, roomT, error }`, or `{ at, ok: false, error }`).

### 4.3 Commands

| Route | Body | Effect |
|---|---|---|
| `PUT /api/rooms/:id/machines/:key` (`intake`, `exhaust`, `circulation`, `humidifier`) | `{ "on": true }` | save commanded + `relay_sent_at`, then write fn 05 at once (through the same client queue); 200 with the machines object (4.4) |
| `PUT /api/rooms/:id/machines/ac` | `{ "power": true, "mode": "cool", "setpoint": 23.5, "fan": "auto" }` (all four required) | save commanded + `ac_sent_at`, then write fn 16; 200 with the machines object |

Errors: 404 room / unknown key; 400 bad body (`field`); 400 "No relay module address set" / "No aircon gateway address set". A failed write still keeps the command and returns 200 with `lastWrite: { ok: false, error }` for that device; the next polls then show it as not following. No automatic re-send: sending the same command again is the user's "Send again".

### 4.4 Status (from commanded + the last 2 polls)

Relay machine `status`:

| Status | When (first match wins) |
|---|---|
| `not-wired` | no relay address |
| `no-data` | no poll yet |
| `no-answer` | latest module poll failed |
| `switching` | reported ≠ commanded and the command was sent < 10 s ago |
| `not-following` | reported ≠ commanded |
| `not-running` | reported on, running off in both of the last 2 polls |
| `running-while-off` | reported off, running on in both of the last 2 polls |
| `on` / `off` | otherwise (reported state) |

AC `status`: `not-wired`, `no-data`, `no-answer`, `fault` (error ≠ 0; `errorCode` shown), `switching` (< 10 s), `not-following` (any of power/mode/setpoint/fan differs), else `on` / `off`.

`GET /api/rooms/:id/machines` →

```json
{ "relay": { "address": 10, "lastWrite": null,
    "machines": [ { "key": "intake", "commanded": true, "reported": true, "running": true, "status": "on" }, … ] },
  "ac": { "address": 20, "lastWrite": null,
    "commanded": { "power": true, "mode": "cool", "setpoint": 23.5, "fan": "auto" },
    "reported":  { "power": true, "mode": "cool", "setpoint": 23.5, "fan": "auto" },
    "roomT": 24.8, "errorCode": 0, "status": "on" } }
```

(`reported`/`running`/`roomT`/`errorCode` null when unknown; `lastWrite` null or `{ at, ok, error }` of the latest write.)

### 4.5 Page

| Element | Behaviour |
|---|---|
| Room dialog | "Machines (Modbus address)": Relay module, Aircon gateway |
| Room detail | new "Machines" card below the sensor cards: a row per relay machine (name, On/Off toggle button showing the commanded state, "reported on/off", running dot, status word with colour: on/off neutral, switching muted, not-following / not-running / running-while-off / no-answer red); an AC row (Power toggle, Mode select, Setpoint number 16–30 step 0.5, Fan select, **Send** button; reported values and room T; error code when fault); not wired → "No relay module address set" / "No aircon gateway address set" with Edit |
| Refresh | same 5 s refresh; a toggle sends at once and repaints from the reply; inputs that have focus or unsent AC edits are not overwritten by the refresh |

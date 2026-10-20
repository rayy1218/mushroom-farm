# Energy and water usage, outdoor sensor (iteration 7)

Date: 2026-10-20. Status: approved by the owner's request ("energy and water usage. outdoor sensor"); defaults decided here, as the owner asked for no design questions.

## 1. Scope

| In | Out (later) |
|---|---|
| A farm-wide outdoor T/RH probe: polled, stored, shown on the Overview, the room drawing and the room charts | Using the outdoor air in automatic control |
| An optional energy meter per room (Modbus), its readings stored | A water meter (no metered water: the humidifier is the only water user) |
| Machine power ratings and humidifier output per room, for estimates | Tariff time bands (ToU), the RM 20 monthly retail charge |
| Daily energy (kWh) and water (L) per room, metered or estimated, with costs | Energy per block or per kg (needs batches) |
| The device app: an outdoor probe and an energy meter that the simulation drives | |

## 2. Outdoor sensor

| Item | Rule |
|---|---|
| Device | a T/RH probe with the room probe's registers (function 04, registers 1–2: T × 10 signed, RH × 10) |
| Where it is set | Settings page: "Outdoor sensor address", 1 to 247 or empty (none). Must not be an address a room uses (400 with field `outdoorAddress`, "Address n is used by Room x") and a room may not take it (the room check names "the outdoor sensor") |
| Polling | first in each cycle, when set |
| Storage | table `outdoor_readings (id INTEGER PRIMARY KEY, address INTEGER NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL CHECK (ok IN (0,1)), t REAL, rh REAL, error TEXT)`, index `(at)` |
| Status | as a room sensor: online (latest poll answered), timeout (1–2 failed in a row), offline (3 or more), `no-data` (set, no reading yet), `not-set` |
| Checks | the room T/RH checks (range, jump, frozen; 3 bad = fault) without the exchange and humidifier exemptions; a fault shows as a chip on the Overview card; no alarm row (alarms belong to rooms) |
| API | `GET /api/outdoor` → `{ address, status, last: { at, t, rh, dew } \| null, check: { ok, why, fault } \| null, spark: { t: [{ at, v }], rh: [...] } }` (spark: 24 h in 30 min buckets, like the Overview rooms); `GET /api/outdoor/history?range=1h\|6h\|24h\|7d\|30d` → the shape of a room's history series for `t` and `rh` |
| Overview | an "Outdoor" card first: T, RH, dew point, status, the 24 h sparklines; "No outdoor sensor: set one on Settings" when not set |
| Room page | the drawing shows outdoor T and RH and the sun or the moon (night 19:00–07:00 local); the T and RH charts draw the outdoor values as a second, dashed muted line (live and history ranges) with a legend "Outdoor" |
| Device app | a simulated room gets a fifth link `outdoorProbe` (a T/RH probe; not `outdoor`, which already names the room's outdoor air in the reply); each tick writes the room's outdoor T and RH (`outdoorAt`) into it; a device can be linked once, as for the other links |

## 3. Energy meter

| Item | Rule |
|---|---|
| Device | an Eastron SDM120-Modbus style single-phase meter: function 04, input registers 0x000C–0x000D active power (W) and 0x0156–0x0157 total active energy (kWh), each an IEEE-754 float32 with the high word first |
| Where it is set | room dialog, Sensors section: "Energy meter address" (optional, 1–247, unique like the other addresses) |
| Polling | after the room's sensors, two reads (power, energy); a failed read = a failed poll |
| Storage | table `meter_readings (id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL, address INTEGER NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL CHECK (ok IN (0,1)), power_w REAL, energy_kwh REAL, error TEXT)`, index `(room_id, at)`; deleted with the room |
| Room page | a third sensor card "Energy meter": status, power now (W), meter total (kWh), "n s ago"; `GET /api/rooms/:id/sensors` returns it as a third element `{ kind: 'meter', address, status, failuresInRow, lastOk: { at, power, energy } \| null, readings }` |
| Device app | kind `meter` with values `power` (W, 0–100000) and `energy` (kWh, 0–10⁹), typed by hand, answering as the registers above; a simulated room's sixth link `meter`: the simulation writes the room's electrical power and adds its energy each tick (the total survives a restart) |

## 4. Machine ratings (room dialog, new section "Power and water")

| Field | Default | Range | Used for |
|---|---|---|---|
| `intakeW`, `exhaustW` | 60 W | 0–5000 | estimate |
| `circulationW` | 60 W | 0–5000 | estimate |
| `humidifierW` | 80 W | 0–5000 | estimate |
| `humidifierLH` | 2.0 L/h | 0–100, step 0.1 | water |
| `acInputW` | 1050 W | 0–20000 | estimate (a 12000 BTU/h inverter split's rated input) |

Stored as `rooms` columns `intake_w, exhaust_w, circulation_w, humidifier_w, humidifier_lh, ac_input_w` (REAL NOT NULL with these defaults) and `meter_address` (INTEGER, 1–247). The defaults match the device simulation (fans and humidifier) so a simulated room's estimate and its meter can be compared.

## 5. Usage (server/usage.js)

| Item | Rule |
|---|---|
| Day | local calendar day of the farm device (server time zone), `YYYY-MM-DD` |
| Run time | from `machine_log` (commanded on/off, with the aircon's power, mode and setpoint): the intervals a machine was on, cut at day boundaries; a machine on now counts up to now |
| Estimated energy | Σ run time × rating. Aircon: time with power on in cool, dry or heat × `acInputW` (an upper bound: an inverter usually runs below its rated input), fan mode × 5 % of `acInputW` |
| Metered energy | Σ of the increases of `energy_kwh` between consecutive good readings of the room's meter, each given to the day of the later reading; a decrease (a meter reset or a new meter) is skipped |
| A day's kWh | metered when the room has a meter and that day has at least 2 good meter readings, else estimated; the day says which (`metered: true/false`) |
| Breakdown | per machine, always the estimate; when the day is metered, `rest` = metered − the fans' and humidifier's estimates (≥ 0, "mostly the aircon") replaces the aircon estimate |
| Water | humidifier run time × `humidifierLH` (litres) |
| Cost | kWh × electricity price; water L ÷ 1000 × water price, only when a water price is set |
| API | `GET /api/rooms/:id/usage?days=1..90` (default 30) → `{ prices: { electricity, water }, days: [{ date, kWh, metered, byMachine: { intake, exhaust, circulation, humidifier, ac, rest }, waterL }], today, last7, last30 }` with `today`/`last7`/`last30` = `{ kWh, cost, waterL, waterCost, metered }` (`metered`: the range has a metered day and every day that used anything is metered, so empty days before the first data do not count; `waterCost` null without a water price); days oldest first, today last; `GET /api/usage?days=` → the same totals for the whole farm plus `rooms: [{ id, name, today, last30 }]` |

## 6. Settings (Settings page)

| Field | Default | Range |
|---|---|---|
| `outdoorAddress` | none | 1–247 or null |
| `electricityPrice` | RM 0.55 per kWh (TNB LV General 50.68 sen + AFA 3.61 sen, Oct 2026, + KWTBB 1.6 %; docs/research/2026-10-09-economics-defaults.md on master) | 0–10, step 0.01 |
| `waterPrice` | none (blank: water costs are not shown; "enter the rate on your water bill") | 0–100 per m³ or null |

`PUT /api/settings` accepts any of the fields (the others are kept); validation 400 with `field`.

## 7. Pages

| Page | Part |
|---|---|
| Room page | "Energy and water" card below the charts: tiles Today, 7 days, 30 days (kWh, RM, litres, RM water when set; "estimated" or "metered"); a 30-day bar chart of kWh per day (metered bars solid, estimated hatched) and one of litres per day, drawn 1:1 at host width; a 30-day breakdown table per machine |
| Overview | "Outdoor" card first, then an "Energy and water" card for the farm (today, 30 days) with a line per room |
| Settings | the three fields of section 6 |
| Room dialog | "Energy meter address" in Sensors; the "Power and water" section of section 4 |

## 8. Device simulation: electrical power

| Part | Power |
|---|---|
| Aircon | (sensible + latent cooling) ÷ COP, or heating ÷ COP, with COP = clamp(3.6 − 0.06 × (outdoorT − 27), 2, 5) (3.1 at 35 °C); plus 40 W indoor fan while on |
| Fans, humidifier | their heat in the model: intake 60 W, exhaust 60 W (its heat goes outside, its power is still paid), circulation 60 W, humidifier 40 W per L/h |
| Meter | power = the sum; energy += power × simulated time; written to the linked meter |

## 9. Database

Upgrade 8 → 9: the `rooms` columns of section 4, tables `outdoor_readings` and `meter_readings`; settings are rows of the existing `settings` table (`outdoorAddress`, `electricityPrice`, `waterPrice`).

## 10. After the review (2026-10-20)

| Item | Rule |
|---|---|
| Metered energy and meter glitches | only an increase above the highest total seen counts; a lower total counts nothing and becomes the new base after 3 readings in a row (a real reset or a new meter); a step above 100 kW × the time since the last reading is skipped (a new meter with a higher total loses that one step) |
| Unwired machines | clearing or changing a room's relay module or aircon address logs that device's machines that were on as off (source `manual`), so the estimate stops charging them |
| Breakdown on a metered day | the machines add up to the day's kWh: estimates above the meter are scaled down to it, `rest` 0 |
| Speed | completed days are cached per room (a day is final 60 s after it ends; dropped when the room changes, a late meter reading arrives, or a machine-log row lands in a final day); today's metered sum is one SQL pass over a covering index; the cache is filled after start one day at a time (`warmUsage`), so the first request after a start can still take a few seconds while it runs |
| Indexes | meter_readings (room_id, address, id), (room_id, address, id) WHERE ok = 1, (room_id, address, at, energy_kwh) WHERE ok = 1; outdoor_readings (address, id), (address, id) WHERE ok = 1, (address, at, ok, t, rh); query-plan tests |
| Outdoor | the history and the sparklines show only the current address's readings, through the room history's completed-bucket cache; the outdoor checks are kept in memory and fed only new readings |
| Device meter | the total belongs to the meter device: each tick's energy is added to it and it is saved with the device state (every 10 s and on stop), so a restart answers the right total from the first poll and moving a meter to another room never makes it jump; the room's `meterKWh` is only the room's own total. The outdoor probes get their values before the device starts answering |

Measured with 30 days of 1 s readings (2.6 million meter and 2.6 million outdoor rows): room sensors 2.7 s → 0.5 ms; room usage 7.2 s → 4 ms (cold, once per past day: about 150 ms a day); farm usage 7.1 s → 4 ms; /api/outdoor 240–490 ms → 0.3 ms (83 ms the first time); 30-day outdoor history 1.7 s → 1 ms (about 1 s the first time).

# Equipment tab: a card per sensor and machine (iteration 18)

Date: 2026-10-27 · Branch `v2` · After iteration 16 (Room profile and Equipment tabs). Web only: the rooms API does not change.

The owner asked (2026-10-27, with a screenshot of another app's "Indicators" page, a grid of small cards): "make machine and sensor individual card like [it], and their respective setting inside it". The lead chose the defaults below.

## 1. Layout

| Item | Rule |
|---|---|
| Sections | two headings on the Equipment tab, **Sensors** then **Machines**, each over a grid of cards |
| Grid | `repeat(auto-fill, minmax(260px, 1fr))`, 16 px gap; one column on a phone; the tab no longer capped at 760 px |
| Card | title (the device), a small muted line under it (what it is: "Modbus address 2", "Relay output 1", "Not fitted"), a status line, then its settings stacked one per row |
| Status line | from data the room page already loads (no new requests): a sensor's status (Online, Timeout, Offline, No address) and latest value (e.g. "20.1 °C · 92 %", "638 ppm", "372 W", "40 Pa"); a machine's state (On, Off, Not wired, Not fitted) as the Climate tab names it. Left out where the page has no such data |
| Fitted machines | Dehumidifier and Lights: a "Fitted" box at the top of the card; unticked, the card is dimmed and shows only the box and "Not fitted" |

## 2. The cards and their settings

| Section | Card | Muted line | Settings (field names of `web/room-fields.js`) |
|---|---|---|---|
| Sensors | T/RH probe | Modbus address N / No address | `trhAddress` |
| Sensors | CO₂ sensor | as above | `co2Address` |
| Sensors | Energy meter | as above | `meterAddress` |
| Sensors | Intake filter | Pressure sensor address N / No pressure sensor | `dpAddress` (labelled "Pressure sensor address"), `filterCleanPa`, `filterFinalPa`, `filterChangeDays`, and the filter hint |
| Machines | Relay module | Modbus address N | `relayAddress`, and one muted line: "Outputs: 1 intake, 2 exhaust, 3 circulation, 4 humidifier, 5 dehumidifier, 6 lights" (counted from 1, as the Fitted boxes say) |
| Machines | Intake fan | Relay output 1 | `intakeW`, `fanMaxPa` |
| Machines | Exhaust fan | Relay output 2 | `exhaustW` |
| Machines | Circulation fan | Relay output 3 | `circulationW` |
| Machines | Humidifier | Relay output 4 | `humidifierW`, `humidifierLH` |
| Machines | Dehumidifier | Relay output 5 / Not fitted | `dehumidifier` (box "Fitted"), `dehumidifierW`, `dehumidifierLday` |
| Machines | Lights | Relay output 6 / Not fitted | `lights` (box "Fitted"), `lightsW` |
| Machines | Aircon | Aircon gateway address N | `acAddress`, `acInputW` |

Every field of the old four cards is in exactly one card (a test checks it). Labels stay those of `room-fields.js`, shortened inside a card where the card already names the device ("Power (W)" in the Exhaust fan card, "Address" in a sensor card); the server's error words do not change.

## 3. Saving

| Item | Rule |
|---|---|
| Save per card | each card is its own form: Save and Reset appear in it once it has unsaved edits ("Unsent changes"), as on the Room profile tab |
| Body | the card's values over the newest loaded room (`roomBody`), so one card's Save never sends another card's unsent edits; those stay in their card |
| Checks | the page's checks run on the merged room, so an address clash with another card's saved address, or the filter pressures against the Intake fan's maximum pressure, show under this card's field; a clash or pressure rule that blames a field of another card shows under this card's Save in the server's words |
| Refresh | per card, the iteration 16 rule: a card with unsaved edits, saving or with focus is not refilled; a Save with nothing changed sends nothing |
| After a save | the page head, the other tabs and the other (unedited) cards refresh from the saved room |
| Set address | the sensor and machine cards' "Set address" buttons (other tabs) still open the Equipment tab with the cursor in that field |

## 4. Tests and checks

| Item | Rule |
|---|---|
| Pure | the card list (section, title, fields) as a pure table in `web/room-fields.js` or a new `web/equipment-cards.js`; tests: every equipment field in exactly one card, order as in section 2, Dehumidifier and Lights carry their fitted box |
| Save | a card's body merges only its fields over the loaded room; a clash with another card's saved address is caught before sending |
| Source checks | the Equipment tab builds one form per card; the Room profile tab and the Add room dialog do not change |
| Browser | throwaway app (copy of the database, dead gateway or the device app on other ports), desktop and phone: grid, a dimmed unfitted card, a save in one card while another holds an edit, an error on a field |

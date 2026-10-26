# The Room card: a flat, coloured picture with reading and machine tiles (iteration 13)

Date: 2026-10-26 · Branch `v2` · Replaces the drawing of iteration 6 (spec 2026-10-20-room-drawing-design.md) on the room page and the device app's simulated rooms.

The owner asked (2026-10-26) to revise the Room card. Five variants and two combinations were tried as mockups in `docs/mockups/`; the owner chose `docs/mockups/room-overview-minimal-colour.html` ("look great"), after asking for: the minimal layout of the old drawing, the colour and realism of the container picture, fans that turn in place, labels next to their machines, and fans drawn the same way on both walls. That mockup is the visual reference: match its shapes, colours, positions and wording.

## 1. Scope

| In | Out (later) |
|---|---|
| A new picture in `web/mimic.js`: a teal container cut open, sky and ground, sun or moon, white machine units with one accent colour each, two racks of blocks with lion's mane, the air path from intake to exhaust | A picture per room shape (every room is drawn as the container) |
| The Room card of the room page: the picture, three reading tiles with band bars beside it, a line about fresh air, six machine tiles in air-path order, a line with the outdoor air and the filter | Changing machines from the Room card (the Machines card stays for that) |
| The device app's simulated room cards: the same picture, with the readings drawn inside it (they have no tiles) | The Overview page |
| Dark and light theme, desktop and phone | |

## 2. The picture (`web/mimic.js`, `web/mimic.css`)

| Item | Rule |
|---|---|
| Interface | unchanged: `createMimic(host, { idPrefix, readouts })` → `{ paint(drawState), tick(dt), destroy() }`, `startLoop`, and `fromRoom` / `fromSim` / `view` / `describe` in `web/mimic-math.js` keep their DrawState. New option `readouts` (default false): draw the three readings inside the room (the device app sets it) |
| Size | one layout, viewBox 840 × 380, scaled to the host's width (`width: 100%`, `height: auto`); the wide/narrow layouts and `sizeFor` go |
| Style | flat: no gradients, shadows or hatching. Colours as the mockup's tokens, set in `mimic.css` per theme: sky (day, night), ground, container steel and ribs, room inside, floor, white unit with an edge in the light theme only, accents (aircon blue, humidifier light blue, dehumidifier violet), running colour (teal), cool air (blue), lion's mane (cream bag, white cap) |
| Sky | day or night from the DrawState (`night`); a sun or a moon; outdoor T and RH beside it, or "No outdoor sensor" |
| Container | teal shell 540 × 222 with ribs on the roof edge, the room inside, a floor strip; on the ground |
| Machines and where their name goes (name in bold, "● On" in the running colour or the state word in muted under it) | Condenser on the roof, name right of it · Aircon under the ceiling, a white unit with its blue key bar and "Aircon · <state>" written on it · Circulation fan under the ceiling, name under it · Intake hood (louvres) outside the left wall with its fan in the wall in front of it, name left of the hood with "· filter N Pa" when the room has a filter reading · Exhaust hood outside the right wall with its fan in front of it, name under the outgoing air right of the hood · Humidifier on the floor right of the racks, name right of it · Dehumidifier on the near wall (only when fitted), name under it inside the room |
| Racks | two racks, three shelves of five blocks with a lion's mane each; the blocks line ("950 lion's mane blocks", from the DrawState `blocks`) under the container on the ground |
| States | running: teal blades and ring, motion (below); off: grey blades; `warn` (a machine fault or not following): an amber outline on its unit and "!" before its state; no data (`known` false): the unit at 60 % opacity and its state "No data" |
| Motion (the existing `startLoop` / `tick`) | fans turn about their own hub (a rotation of the blade group about its own origin, never a CSS rotation about the bounding box); intake and exhaust at their level, the condenser while the compressor runs, the circulation fan slowly; cool air streams under the aircon while it cools; mist rising from the humidifier while on; drops under the dehumidifier while on; the air path animated (dashes moving to the exhaust, an arrow out) while the intake or the exhaust runs, otherwise a faint dotted line. Nothing moves with `prefers-reduced-motion` |
| Readouts (`readouts: true`, the device app) | three small boxes on the sky right of the container, above the exhaust (value and its chip text, as the old readouts); inside the room there is no space without covering the humidifier, its mist and the circulation fan's name |
| Order of drawing | every hood before its fan (the fan in front), the air path under the fans and machines |
| Narrow hosts | below 640 px of host width every small text inside the picture is hidden (class on the host): the names, the outdoor air, the aircon's state, the blocks line and the readout boxes; the tiles (or the device's line) say the same |
| aria-label | `describe(view)` as now |

## 3. The Room card (`web/room-detail.js`, new `web/room-card.js`, `web/room-card-math.js`)

| Item | Rule |
|---|---|
| Header | "Room" and, right, the control note ("Automatic control on · fresh air every 15 min", "Automatic control off") |
| Crop stage (owner, 2026-10-26: "add the stage of crop") | under the header, a link to the Crop tab: the stage in bold, then the Crop card's words ("since 26 Oct 09:55 · day 1 of 7 · flush 1 of 4") and what comes next ("Next: Rest between flushes, about 2 Nov 09:55", or "Flush 4 of 4 done: replace the blocks"); none without crops. The line under the picture adds the stage: "950 lion's mane blocks · Fruiting" |
| Top | a card 1100 px and wider: the picture and the reading tiles side by side, the picture box at its own height (no fill below it), the tiles column 230 to 280 px; narrower: the picture full width, the three tiles in a row of three under it, then the fresh-air line; on a phone (card below 720 px) the tiles stacked first, then the picture |
| Reading tile | name, the value large with its unit, a chip right ("✓ In band", "▼ Below band", "▲ Above band", "▲ Safety level", "Offline", …, the same words as `readoutStatus`), a band bar: the scale as a track, the band as a lighter zone with its limits written under it, the reading as a mark. Scales: T 15–30 °C, RH 70–100 %, CO₂ 400 to max(1500, safety level + 100) ppm, widened to hold the reading. An amber edge on the tile when out of band, red at the safety level, grey when no data |
| Fresh-air line (under the tiles) | while an exchange runs: `exchangeLine` (control-math.js); auto off: "Automatic control off"; else when fresh air is every N min: the server's "Fresh air waits …" reason when it has one, otherwise "Next fresh air in N min" from `freshFrom + exchangeEveryMin`, `exchangeEndedAt` standing in for a missing `freshFrom` as in the controller ("Fresh air due" when past; with neither, "Fresh air every N min"); fresh air off: nothing |
| Machine tiles | six in air-path order, numbered 1–6: Intake fan "Air in", Aircon "− Temperature", Circulation "Mixes the air", Humidifier "+ Humidity", Dehumidifier "− Humidity" (only when fitted; then five), Exhaust fan "Air out"; each: name, an On / Off pill (or the state word for no data or a fault), the effect line (teal when on), one detail line: intake "Filter N Pa" (or "No filter sensor"), aircon its state and fan ("Cool 21.5 °C · fan auto"), circulation "Always on" when auto, humidifier "Below <rhLow> %", dehumidifier "Above <rhHigh> %", exhaust "With the intake". Six columns on a desktop, three on a tablet, two on a phone |
| Bottom line | "Outdoor 32.9 °C · 62 % RH" (or "No outdoor sensor") and "Filter 40 Pa, change by 22 Nov" when the room has a filter (the Filter card's words) |
| Data | what the room page already loads (room, sensors with `dp`, machines, control, outdoor); no new requests. The live updates (SSE) of iteration 12 repaint it like the rest of the page |
| Sensor cards | the T/RH probe and CO₂ sensor cards stay under the Room card (address, status, age) |

## 4. The device app

| Item | Rule |
|---|---|
| Simulated room card | `createMimic(el, { idPrefix, readouts: true })`; `fromSim` gives the readings and the machines as now; the filter text from the sim's `acting.filterPa` when it has a filter probe |

## 5. Tests

| Area | Cases |
|---|---|
| `room-card-math.js` (pure) | tile chip and edge per status and band; scale and band zone fractions, the scale widened to the reading, CO₂ scale from the safety level; the fresh-air line for exchange on, auto off, waits, next in N min, due, fresh air off; machine tiles in order, five without a dehumidifier, pills and detail lines, no-data and fault words; the bottom line with and without outdoor and filter |
| `mimic-math.js` | the existing tests keep passing (DrawState unchanged); `view` gains the filter text |
| Page source checks | room-detail uses the card; the device app passes `readouts: true`; the picture rotates blades about their origin (no `transform-box: fill-box` for the fans) |
| Browser check | a throwaway farm and device app (random ports, temp files): desktop and phone, dark and light, a room with the fans off and one during fresh air; compare with the mockup |

## 6. Room page tabs (owner, 2026-10-26: "page is too long make it tab"; chose 7 tabs)

| Item | Rule |
|---|---|
| Above the tabs | the title, Edit and the banner; the alarms sit at the top of the content beside the tabs, outside every panel (seen on every tab) |
| Tabs, with their address | Overview `#/rooms/:id` (the Room card) · Charts `#/rooms/:id/charts` (range, charts, machine timeline) · Control `/control` (automatic control, machines) · Crop `/crop` · Sensors `/sensors` (T/RH probe, CO₂ sensor, energy meter, intake filter) · Energy `/energy` (usage) · Simulations `/simulations` |
| Tab bar | links with an icon each (`web/route.js` `ROOM_TABS`, `roomHash`), `aria-current="page"` on the current one. From 900 px a side bar left of the content (owner: "use sidebar here for the tabs"), the current tab filled, sticky under the top bar; below 900 px a row above the content (no icons), the current one underlined, scrolling sideways with the current tab kept in view |
| Changing tab | the router shows the tab's panel and hides the others; the page is not mounted again (its data, live updates and timers stay); Back and reload keep the tab |
| Links in | a simulation run's back link opens Simulations; the farm energy card's room links open Energy; the rest open Overview |

## 7. The app's frame (owner, 2026-10-26: "remove the sidebar, add settings on top right, add title before the rooms card and a show all room for the room listing page")

| Item | Rule |
|---|---|
| Side bar and bottom tab bar | gone at every width |
| Top bar | the farm's name (a link to the Overview, with the alarm count badge), then right: Live, the theme button, Settings (a gear with its name; the gear alone below 600 px, named for screen readers) |
| Page width | the page under the bar at most 1400 px wide, centred |
| Overview | a "Rooms" title over the room cards with "Show all rooms" at its right, to the room list (#/rooms) |

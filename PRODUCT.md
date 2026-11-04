# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

| Who | Situation | Job |
|---|---|---|
| Owner | Runs the farm; at a desk for setup and analysis, on a phone at the rooms | Sets up rooms, machines, crops and bands; reads history, energy and simulation results; decides what equipment to buy |
| Farm workers | On the farm floor, at or inside the grow rooms, usually on a phone | Check a room's readings and machines, acknowledge alarms, switch machines by hand when needed, act on stage changes and filter or block replacement reminders |

Desk and phone use are equally important. The app is in English only.

## Product Purpose

The farm app runs the climate of mushroom grow rooms on one farm in lowland Malaysia. It reads each room's sensors over Modbus, runs its machines (intake, exhaust and circulation fans, humidifier, dehumidifier, aircon, lights) automatically against bands that follow the crop and stage, raises alarms (on screen and by Telegram), and keeps history, energy and water use. A simulator tests settings and suggests machine sizes before anything is bought.

Climate control is the first and most important module. The aim is to cover every part of running the farm; planned modules include batches, substrate and spawn, harvest and yield, contamination, inventory, sales, costs, workers and MyGAP compliance.

Success: the rooms stay in band (temperature, humidity and CO₂) with the least energy, problems reach a person fast, and the owner can trust the numbers when deciding what to grow and what to buy.

## Positioning

Built for this farm only, not for sale. It is shaped by the farm's strategy: few climate-controlled mushroom farms exist in Malaysia, so the farm aims to grow cool-climate crops (lion's mane as the main target) in the hot, wet lowlands, against Cameron Highlands growers (no cooling cost) and imports. The app's simulation of lowland weather, aircon behaviour and energy cost exists to decide whether that pays.

## Operating Context

| Fact | Detail |
|---|---|
| Hosting | A Node 22 server on a farm computer (or Docker on Windows, macOS or Linux), reached by browsers on the farm's LAN |
| Access | No login; anyone on the LAN can use every page |
| Wiring | Sensors and machines on RS-485 behind an Ethernet-to-RS-485 gateway (Modbus TCP); a device app stands in for the hardware during development |
| Climate | Outdoor air about 25–33 °C with a dew point near 24 °C; split aircons; room volumes around 60–120 m³ |
| Time | The farm computer runs on Asia/Kuala_Lumpur time; lights follow its clock |
| Alarms | Shown on the Overview, the room page and the top bar badge; critical and serious ones sent to a Telegram chat |
| Updates | Pages refresh live over one server-sent-events connection; readings every 5 s by default (1–300 s) |
| Money | Ringgit (RM); electricity RM 0.55/kWh by default |

## Capabilities and Constraints

| Area | Confirmed |
|---|---|
| Rooms | Add, edit, delete; dimensions, crops, farm type (ready-to-fruit blocks or full cycle) |
| Live | Readings with sensor checks (no answer, out of range, jump, frozen), machine command vs reported vs running |
| Control | Manual or Auto per room; bands follow crop and stage; outdoor-air free cooling and drying; machine protection from rapid switching |
| Crops | Grey, black, pink, abalone and golden oyster, wood ear, reishi, milky; lion's mane as a draft |
| History | Live, 1 h, 6 h, 24 h, 7 d, 30 d; machine timeline; outdoor values on the charts |
| Energy and water | Metered or estimated per machine; kWh, RM and litres |
| Harvest | Runs of blocks; harvests from the checks or by hand; kg, kg per block, BE, RM value and cost per kg; Settings → Yield; CSV and the myGAP 4-6 sheet |
| Simulation | Background runs of a room's program; Suggest machines lists the best five setups |
| Stack | Node 22.13+, `node:http`, built-in `node:sqlite`, plain HTML, CSS and JS modules, no build step, no npm dependencies, `node --test` |
| Units | Metric only: °C, %, ppm, m, m³, L, kWh, Pa, W |
| Open | Worker roles and permissions are not decided (no login today); Malay is not planned |

## Brand Commitments

| Commitment | Detail |
|---|---|
| Name | "Mushroom farm", with the line "Climate and harvest" |
| Voice | Plain English in short, concrete sentences; name the machine, the number and the unit; say what happens and why (for example "the exchange runs · free cooling") |
| Units | Metric everywhere; US units never appear in the interface |

## Evidence on Hand

| Evidence | Path |
|---|---|
| Feature specs, one per iteration | `docs/superpowers/specs/` |
| Room overview mockups (the owner chose `room-overview-minimal-colour.html`) | `docs/mockups/` |
| Room drawing screenshots | `docs/screenshots/2026-10-20-room-drawing/` |
| Crop, equipment and economics research pages (not committed) | `research/` |

There are no customers, testimonials or sales figures, and no yield figures beyond what the farm records in the app itself (the app has no sales records). Do not invent any. The lion's mane block price is still unknown (it needs a supplier quote).

## Product Principles

1. **The rooms come first.** A reading, an alarm or a machine fault must be the easiest thing to see; everything else waits.
2. **Show what is real.** Show what was commanded, what the device reports and whether it is running; when a number is estimated, simulated or stale, say so.
3. **Say why.** Every automatic action and every alarm names its cause in plain words, so a worker can act and the owner can tune.
4. **One app for desk and floor.** Every task works on a phone at the room and on a desktop; setup may be denser on a desk but never desk-only.
5. **Numbers decide the business.** Energy, cost and simulation results must be trustworthy enough to decide crops and equipment.

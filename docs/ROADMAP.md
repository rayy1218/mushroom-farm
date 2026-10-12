# Mushroom farm app: roadmap

Mission (owner, 2026-10-07): cover every part of running a mushroom farm. Climate control is the first and most important part.

Strategy (owner, 2026-10-08): few climate-controlled farms exist in Malaysia, so grow what others cannot (cool-climate crops in the lowlands). Main target crop: lion's mane. The owner's own calculation says grey oyster does not earn enough under a controlled climate (the yield gain over traditional sheds does not pay for the climate cost). Competitors: Cameron Highlands growers (no AC cost) and imports.

Legend: ✅ built · 🔨 in progress · 📋 owner's plan, not started · 💡 suggestion, not agreed

## 1. Climate

| Part | Status |
|---|---|
| Climate controller (stages, fog, air exchange, AC, alarms, eight tropical crops) | ✅ |
| Server running every room 24/7, SQLite, live feed (wave 1) | ✅ |
| Test bench simulator, capacity check, calibration from CSV | ✅ |
| Full crop-cycle simulation (C7, `cycle.js`) | ✅ |
| Rooms home; room tabs Live / Simulate / Calibrate; saved simulation runs; predicted vs real; calibration from the room's history (wave 2) | ✅ |
| Equipment check (C8): per-room AC hp, fogger, air exchange size (C9 sizing rule), walls; size search; blunt verdicts ("your 1 hp is too small, buy 2 hp"); heat breakdown; the "Your machines" card in the Simulate tab (wave 2) | ✅ |
| Lion's mane crop profile (draft, pinning CO₂ 1000 ppm) and cold-room controller tuning; a stage change that lowers the CO₂ limit flushes at once (research: `docs/research/`; wave 2) | ✅ |
| Room drawing: intake and exhaust fans by position, closed dampers, circulation fan CF-205, smaller text, more live values (power per machine, air changes, zones, core); at-a-glance panel; controller section grid | ✅ |
| Air exchange (C9): intake + exhaust pair on demand, short purges capped at 3 min, stop level floored at 600 ppm, "air exchange too small" alarm with the size needed, sizing for the checks; the default 2000-block cycle passes every stage with about 8 % less energy than the old always-on fan | ✅ |
| Capacity check: find every pass window (golden oyster is too wet from about 300 to 1600 blocks and passes again near 2000; the single-window search can miss the wet band). Belongs with C8. | 📋 |
| "Heat through walls and roof (W/K)" label; the test bench loads and saves a room's settings (wave 2) | ✅ |
| Real sensors and machines (hardware adapter in place of the simulator) | 📋 |
| Alarms to the phone (Telegram, WhatsApp or SMS) | 💡 |
| More cool-climate crops: king oyster, shiitake, shimeji | 💡 |
| Malaysian weather data (MetMalaysia) for the design days; editable design days | 💡 |

## 2. Planning and money

| Part | Answers | Status |
|---|---|---|
| Economics | Profit per block per crop, controlled vs traditional, break-even | 💡 (suggested as the next part after wave 2) |
| What to buy | Equipment and insulation for a planned room before it is built (reuses the equipment check) | 📋 |
| Costs | Electricity (measured by the simulation), blocks, labour, equipment; cost per kg | 📋 |
| Sales | Buyers, orders, prices, deliveries | 📋 |

## 3. Growing operations

| Part | Tracks | Status |
|---|---|---|
| Batches | Each lot of bought blocks: crop, strain, source, received, placed in a room, cleared (C10, wave 2) | ✅ (phone check with a real sticker still to do) |
| Substrate and spawn | Recipes, sterilisation, spawn source, inoculation | 📋 |
| Harvest and yield | Crate weights recorded by scanning the room's QR sticker; kg, g per block and BE % per flush and batch (C10, wave 2) | ✅ (phone check with a real sticker still to do) |
| Contamination | Losses by batch and room, with causes | 📋 |
| Inventory | Bags, sawdust, supplements, spawn, packaging | 📋 |

## 4. People and compliance

| Part | Status |
|---|---|
| Workers: tasks, harvest rounds, who did what | 📋 |
| Login and roles (owner, worker, installer); left out of v1 on purpose | 📋 |
| MyGAP compliance records, produced from the data above | 📋 |

## Suggested order after wave 2

| # | Part | Why here |
|---|---|---|
| – | Batches and harvest (room QR) | Built in wave 2 (contract C10) |
| 1 | Economics | With the equipment check, it proves whether lion's mane pays in a lowland room |
| 2 | Real hardware | Turns the simulator into a farm |
| 3 | Costs and sales | Profit from real numbers |
| 4 | Contamination and inventory | Day-to-day operations |
| 5 | Workers and login | More than one person uses the app |
| 6 | MyGAP | Mostly a report over the data above |

Each part gets its own spec, frozen contracts and a parallel build, as the climate work did (`docs/contracts/`, `docs/superpowers/`).

# Economics defaults: the research behind every figure (stage 1)

| Item | Value |
|---|---|
| Date | 2026-11-06 |
| Purpose | The research default, low–high range, confidence and sources of every figure on the Economics page (spec `2026-11-06-economics-design.md`, section 4), for grey oyster, pink oyster, black jelly (wood ear) and lion's mane. The code carries these in `web/economics-defaults.js` |
| Built on | The October defaults (`docs/research/2026-10-09-economics-defaults.md` on `master`, ids S01–S49) and the lion's mane model page (`research/lions-mane-economics.html`, not committed, ids L01–L38), re-checked today (ids G01–G33); pink oyster (ids P01–P38) and black jelly (ids J01–J38) researched today |
| Confidence key | high = several recent Malaysian sources agree; medium = one or two Malaysian sources, or a clear official figure; low = estimate, old, or not Malaysian |
| Marks | "search summary": the page was seen only in a search engine's summary, not fetched. "Estimate": no source; the reasoning is in the note |
| Exchange rates | RM 4.057 per USD (Bank Negara reference rate, 6 Nov 2026, G02); RM 0.61 per CNY; RM 0.125 per THB; RM 0.00026 per IDR; RM 0.073 per PHP (approximate) |
| Set so the block life matches | Where a source gives a whole block life but not its parts, "Rest and turnaround" is set so first harvest + flushes + turnaround equals that life (the model page's own rule, L01) |

## 1. The defaults

### 1.1 Farm figures (every room and every crop)

| Figure | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|
| Electricity price | RM/kWh | Settings → Electricity price (the app's default 0.55) | 0.515 | 0.596 | medium | L18, L19, G01, G19 | LV non-domestic 50.68 sen + AFA 3.60 sen (Nov 2026) × 1.016 (KWTBB) = 55.15 sen; high: TNB's December forecast AFA +7.98 = 59.6 sen. Shown from Settings, not set on Economics |
| Electricity fixed charge | RM/month | 20 | 10 | 20 | medium | L18, S35 | Retail charge per account; RM 10 on the Specific Agriculture tariff if the farm qualifies (unverified) |
| Labour cost | RM/h | 10 | 8.72 | 12 | medium | L21, G17, G18 | RM 8.72/h minimum plus about 15 % employer contributions (not sourced). The minimum rises to RM 2,000 a month from June 2027 (SMEs under RM 50 million sales exempt; not yet gazetted) |
| Equipment written off over | months | 60 | 36 | 96 | low | L01 | The owner's earlier estimate; no interest |

### 1.2 Shared by every way (each crop, every room)

| Figure | Crop | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|---|
| Selling price | Grey oyster | RM/kg | 10 | 8 | 13 | high | S12, S14, S15, S16, G04 | Farm-gate and wholesale; stands (re-checked). Retail RM 16 (12–25; G07: a Jerantut grower sells at RM 22/kg) |
| Selling price | Pink oyster | RM/kg | 20 | 14 | 45 | low | P01, P03, P14, P21, P22 | No Malaysian pink wholesale price. Coloured-oyster farm-gate RM 16 (2020, 2022); Thai pink wholesale RM 10–12.50; boutique retail RM 90–100/kg (P09, P10); RM 45 if sold direct to restaurants |
| Selling price | Black jelly | RM/kg | 25 | 15 | 30 | medium | J01, J02, J08, J10, J11 | Growers quote RM 30 (2020, 2024); Chinese fresh black fungus at RM 18–24 retail caps what buyers pay |
| Selling price | Lion's mane | RM/kg | 50 | 30 | 70 | low | L01, L02, L03, L05, L09, G10 | The owner's earlier estimate, between import (about RM 33) and farm-direct (RM 70, Perak); retail now RM 90–133/kg (Shroomy RM 60 per 450–500 g). No wholesale price found |
| Shrink, harvest to sale | Grey oyster | % | 5 | 2 | 15 | low | S06 | Estimate; 3–4 days at 5–8 °C |
| Shrink, harvest to sale | Pink oyster | % | 10 | 5 | 25 | low | P25, P26, P35 | Twice grey's: about 24–36 h at room temperature, about 4 days chilled |
| Shrink, harvest to sale | Black jelly | % | 6 | 3 | 12 | low | J21, J32 | Base trim about 2 %; keeps 2–5 days at ambient, about 7 at 4 °C; unsold ears can be dried |
| Shrink, harvest to sale | Lion's mane | % | 10 | 5 | 20 | low | L01, L02 | A week in the fridge, two hours outside |
| Packing and delivery | Grey oyster | RM/kg | 0.50 | 0.20 | 2.00 | low | G09, G29, G30 | Wholesale 1–2 kg bags about RM 0.20/kg; retail 200 g punnets about RM 2.00/kg |
| Packing and delivery | Pink oyster | RM/kg | 1.50 | 0.80 | 3.00 | low | P09, P21, G29 | Estimate: small chilled punnets, frequent drops |
| Packing and delivery | Black jelly | RM/kg | 0.80 | 0.50 | 1.50 | low | J08, G29 | Estimate: sold in 200 g trays |
| Packing and delivery | Lion's mane | RM/kg | 3.00 | 1.50 | 5.00 | low | L01 | The owner's earlier estimate; cold chain |
| Block price, ready to fruit | Grey oyster | RM/block | 2.00 | 1.50 | 2.80 | medium | S01, S03, S47, G05 | Stands: Pontian seller RM 2.80 / 2.50 / 2.30 by quantity (19 Jul 2026); RM 1.50 bulk delivered (2020). Own-made about RM 1.00 (0.70–1.50, S04) |
| Block price, ready to fruit | Pink oyster | RM/block | 2.50 | 2.00 | 4.50 | low | P03, P04, P05, P19, P20 | Online small orders RM 3.50–4.50; a Pahang coloured-oyster grower RM 2 (2022); Thai pink blocks RM 1.25–1.88. Own-made about RM 1.00 (estimate) |
| Block price, ready to fruit | Black jelly | RM/block | 2.50 | 2.00 | 3.50 | low | J19, J24, J25 | Not found for black jelly: oyster blocks (RM 2.30–2.80) plus a premium for the 1 kg bag and longer spawn run. Own-made about RM 1.30 (estimate) |
| Block price, ready to fruit | Lion's mane | RM/block | 6.00 | 3.00 | 10.00 | low | L01, L10, L36, G10 | Stands: still no Malaysian block price; China 3 CNY a bag before freight; Shroomy's RM 35 retail kit is only a ceiling. Own-made about RM 2.50 (estimate) |

### 1.3 Your container (each room and crop; the controlled room)

| Figure | Crop | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|---|
| Yield per good block, all flushes | Grey oyster | g | 238 | 204 | 340 | low | S06–S12, S15, S17 | The shed's 170 g plus 40 % for the controlled room (20–100 %; S17 measured +49 %, not Malaysian) |
| Yield per good block, all flushes | Pink oyster | g | 200 | 150 | 300 | low | P24, P29, P31, P32 | +33 % on the shed; pink needs no cooling, the gain is humidity, CO₂ and air. 150–200 g saleable per kg of substrate (P24) |
| Yield per good block, all flushes | Black jelly | g | 260 | 200 | 400 | low | J05, J21, J22 | About +45 % on the shed; BE 80.9 % over 4 flushes on rubberwood (J05) is about 320 g a 1 kg bag |
| Yield per good block, all flushes | Lion's mane | g | 250 | 150 | 400 | low | L01, L02, L13, L14, L15 | The owner's earlier 250 g on a 1 kg block (161.3 g first flush × 1.55); Perak "can reach" 150 g in a warm room; Shandong factory 400 g |
| Flushes per block | Grey oyster | flushes | 4 | 3 | 6 | medium | APP | The app's default program |
| Flushes per block | Pink oyster | flushes | 2 | 2 | 3 | medium | P09, P16, P24, P30 | |
| Flushes per block | Black jelly | flushes | 4 | 3 | 6 | low | J21, J22, J37 | Indonesia 4–8; flush 2 is bigger than flush 1 |
| Flushes per block | Lion's mane | flushes | 2 | 1 | 3 | medium | L13, L28 | First flush largest |
| Blocks lost | Grey oyster | % | 5 | 2 | 15 | low | S44, L26 | Under 2 % in MARDI's controlled house, over 10 % in ordinary houses (L26) |
| Blocks lost | Pink oyster | % | 5 | 2 | 10 | low | P24 | Grey's; the mycelium dies below 8–10 °C |
| Blocks lost | Black jelly | % | 7 | 3 | 12 | low | J07 | Estimate; Malaysian growers report high contamination |
| Blocks lost | Lion's mane | % | 10 | 5 | 25 | low | L01 | Bought blocks travel far |
| Days to first harvest | Grey oyster | days | 7 | 3 | 14 | medium | S06, P08, APP | DOA: pins 3–5 days after opening; the app's fruiting stage is 7 days |
| Days to first harvest | Pink oyster | days | 7 | 4 | 14 | medium | P04, P08, P09, P16 | |
| Days to first harvest | Black jelly | days | 18 | 12 | 30 | medium | J06, J21, J24, J26 | Pins 4–10 days after slitting, picked 6–10 days later |
| Days to first harvest | Lion's mane | days | 12 | 10 | 14 | medium | L02, L06 | 11–13 days in Perak; about 10 in Mr Fungus's tents |
| Days between flushes | Grey oyster | days | 17 | 12 | 20 | medium | S06, APP | The app's fruiting 7 days + rest 10 days; DOA: rest at least 10 days |
| Days between flushes | Pink oyster | days | 12 | 7 | 15 | medium | P04, P16, P24, P30 | |
| Days between flushes | Black jelly | days | 20 | 14 | 30 | medium | J21, J22, J26 | |
| Days between flushes | Lion's mane | days | 14 | 10 | 18 | medium | L15 | "14 days apart" |
| Rest and turnaround | Grey oyster | days | 2 | 1 | 10 | low | S06, APP | Set so the block life is the October 60 days (50–80) |
| Rest and turnaround | Pink oyster | days | 6 | 2 | 10 | low | P16, P24 | Set so the block life is 25 days (20–55) |
| Rest and turnaround | Black jelly | days | 7 | 3 | 10 | low | none | Not found; grey's. Block life 85 days |
| Rest and turnaround | Lion's mane | days | 16 | 9 | 30 | low | L01 | Set so the block life is the owner's earlier 42 days (35–56) |
| Electricity per block, over its life | Grey oyster | kWh | 0.46 | 0.40 | 0.55 | medium | APP | The app's simulation (October): RM 0.26 at RM 0.57 |
| Electricity per block, over its life | Pink oyster | kWh | 0.19 | 0.10 | 0.40 | low | APP | Estimate: grey's 0.46 kWh over 60 days per block-day, over pink's 25 days. Work it out for the room |
| Electricity per block, over its life | Black jelly | kWh | 0.65 | 0.40 | 1.00 | low | APP | Estimate: as pink, over 85 days |
| Electricity per block, over its life | Lion's mane | kWh | 0.40 | 0.40 | 1.63 | medium | L38 | The cooling page's low case for a 60 m³ room at full racks: 506 kWh a month for 1,259 blocks started; high case 2,051 kWh |
| Labour per block handled | Grey oyster | min | 2.70 | 1.44 | 14.40 | low | S07, G07, G24 | 0.75 h per 1,000 blocks a day over the 60-day life; range 0.4–4 h (G07, G24: sheds need about one worker per 2,000 blocks) |
| Labour per block handled | Pink oyster | min | 1.13 | 0.75 | 6.00 | low | S07, G07 | Grey's 0.75 h per 1,000 blocks a day over 25 days; picked daily |
| Labour per block handled | Black jelly | min | 3.83 | 2.55 | 20.40 | low | J02, J21, G07 | Grey's rate over 85 days |
| Labour per block handled | Lion's mane | min | 2.52 | 1.26 | 5.04 | low | L01 | 1 h per 1,000 blocks a day over 42 days |
| Transport to buyers | every crop | RM/kg | 0 | 0 | 2 | low | none | No source; a lowland farm near the Klang Valley. Enter your own |

### 1.4 Your container: blocks, rent and equipment (each room, every crop)

| Figure | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|
| Blocks in the room | blocks | The room's volume × 22 (1,482 in a 67.4 m³ 40 ft) | 8.3 a m³ | 29 a m³ | low | L38 | 29 blocks a m³ of room at full racks (derived from DOA's oyster house), a container counting 75 % of its volume; the simulator's test load is 8.3 |
| Rent | RM/month | 0 | 0 | 4,000 | low | L01, L35 | The owner, 2026-10-27: likely 0. Selangor ground-floor shoplots RM 3,800–5,000 |
| Container, delivered | RM | Over 40 m³ (40 ft high cube): 38,100; else (20 ft): 24,550 | 17,300 | 38,100 | low | L29, L31 | Used reefer RM 36,800 (40 ft) or RM 23,500 (20 ft) + Port Klang haulage up to RM 950 / 700 + side loader RM 350. Listings RM 16,000–36,800 |
| Cooling, fitted | RM | 40 ft: 9,040 (2 × Daikin FTKF 2.5 hp, about 7 kW each, at RM 4,170 + RM 350 fitting); 20 ft: 4,520 | 3,960 | 9,040 | medium | G16, L23, L38 | Changed: the 2.5 hp list price is RM 4,170 today (was RM 3,940) |
| Humidifier | RM | 1,500 a unit, one per 6 L/h of the room's humidifier output (at least 1) | 900 | 3,000 | low | S42, L01 | China FOB USD 210–340 for 3–6 L/h plus shipping and fitting |
| Fans, controller and wiring | RM | 3,300 | 1,700 | 7,500 | low | L01 | Fan pair 800, controller 1,500, wiring 1,000; none sourced |
| Racks | RM | 0.70 a block (1,037.40 at 1,482 blocks) | 0.20 a block | 1.30 a block | medium | G21, G25, G33 | Changed: an iron rack RM 250 for 350 blocks (2018); the October RM 3,000 per 2,000 blocks had no source |

### 1.5 Lowland shed (grey oyster, pink oyster, black jelly; a house holds up to 2,000 blocks)

| Figure | Crop | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|---|
| Yield per good block, all flushes | Grey oyster | g | 170 | 100 | 300 | medium | S06–S12, S15, G07 | Stands. Farm data 100–150 g; guides 250–640 g; a Jerantut grower's 400 g is an outlier |
| Yield per good block, all flushes | Pink oyster | g | 150 | 80 | 250 | low | P06, P07, P17, P24, P29 | Malaysian guides 50–150 g a 1 kg bag |
| Yield per good block, all flushes | Black jelly | g | 180 | 120 | 250 | medium | J02, J03, J06 | Malaysian guide 150–200 g a 1 kg bag; UPM 83–131 g over 3 flushes |
| Flushes per block | Grey oyster | flushes | 6 | 4 | 8 | medium | S06, S07, S15 | |
| Flushes per block | Pink oyster | flushes | 3 | 2 | 5 | low | P06, P08, P16, P30 | |
| Flushes per block | Black jelly | flushes | 4 | 3 | 5 | medium | J05, J06, J26 | |
| Blocks lost | Grey oyster | % | 10 | 5 | 50 | low | S07, S44 | About half fruit in the first flush (S07) |
| Blocks lost | Pink oyster | % | 10 | 5 | 20 | low | P02 | Grey's |
| Blocks lost | Black jelly | % | 15 | 10 | 25 | low | J07, J26 | Less tolerant of contamination than oyster |
| Days to first harvest | Grey oyster, Pink oyster | days | 7 | 4 | 14 | medium | S06, P08, P16 | |
| Days to first harvest | Black jelly | days | 18 | 12 | 30 | medium | J06, J21, J24, J26 | |
| Days between flushes | Grey oyster | days | 14 | 10 | 20 | medium | S06 | |
| Days between flushes | Pink oyster | days | 12 | 7 | 15 | medium | P04, P24 | |
| Days between flushes | Black jelly | days | 20 | 14 | 30 | medium | J21, J26 | |
| Rest and turnaround | Grey oyster | days | 13 | 5 | 40 | low | S07, S47 | Set so the block life is 90 days (75–120) |
| Rest and turnaround | Pink oyster | days | 14 | 2 | 50 | low | P06, P07, P24 | Set so the block life is 45 days (30–84) |
| Rest and turnaround | Black jelly | days | 7 | 3 | 40 | low | J02, J03, J24 | Block life 85 days (60–120) |
| Electricity a month, per house | every crop | kWh | 60 | 0 | 150 | low | S07, G27 | Estimate: a misting pump and two fans. The October default was RM 0 (misting by hand) |
| Labour per block handled | Grey oyster | min | 4.05 | 2.16 | 21.60 | low | S07, G07, G24 | 0.75 h per 1,000 blocks a day over 90 days; range 0.4–4 h |
| Labour per block handled | Pink oyster | min | 2.03 | 1.35 | 10.80 | low | S07, G07 | Over 45 days |
| Labour per block handled | Black jelly | min | 3.83 | 2.55 | 20.40 | low | J02, G07 | Over 85 days; misting 3–4 times a day |
| Transport to buyers | every crop | RM/kg | 0 | 0 | 2 | low | none | As your container's |
| Rent | every crop | RM/month | 0 | 0 | 4,000 | low | L01 | |
| House and racks, per house | every crop | RM | 5,000 | 1,300 | 10,000 | low | G20, G21, G22, G23, G26 | Now sourced: RM 2.50 a block of room (0.65–5.00): DOA 2008 RM 16,000 for a 6,000-bag house; a 2010 package RM 5,500 for 5,000 bags |
| Misting kit, per house | every crop | RM | 1,500 | 500 | 3,000 | low | G27 | A shop quote of nearly RM 1,500 (2009) |
| Fans, per house | every crop | RM | 300 | 150 | 2,400 | low | G28 | Estimate for one or two fans; a mist fan RM 2,367 |

### 1.6 Highland grower (lion's mane; a house holds up to 2,000 blocks)

| Figure | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|
| Yield per good block, all flushes | g | 250 | 150 | 400 | low | L01, L16 | Copies your container's although Cameron Highlands averages 17.9 °C, just below 18–24 °C |
| Flushes, days to first harvest, days between flushes, rest and turnaround | flushes, days | 2; 12; 14; 16 | as your container's | as your container's | low | L01, L02, L15 | A 42-day block life, assumed |
| Blocks lost | % | 10 | 5 | 25 | low | L01 | |
| Electricity a month, per house | kWh | 146 | 126 | 146 | low | L37 | Fans 120 W all day (88 kWh) + a 2 L/h humidifier (58 kWh); 1.3 L/h at the low end |
| Labour per block handled | min | 2.52 | 1.26 | 5.04 | low | L01 | |
| Transport to Klang Valley buyers | RM/kg | 2 | 1 | 4 | low | none | Placeholder; no source |
| Block freight up to the highlands | RM/block | 0 | 0 | 1 | low | none | Placeholder; no source |
| Rent | RM/month | 0 | 0 | 4,000 | low | L01 | |
| House and racks, per house | RM | 5,000 | 1,300 | 10,000 | low | L01, G20–G23 | |
| Humidifier, per house | RM | 1,500 | 900 | 3,000 | low | L01, S42 | |
| Fans and wiring, per house | RM | 1,800 | 900 | 3,000 | low | L01 | No controller |
| Lion's mane price in Cameron Highlands | — | not found | — | — | — | G32 | Still not found online |

### 1.7 Warm strain (lion's mane in a lowland shed; a house holds up to 2,000 blocks)

| Figure | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|
| Yield per good block, all flushes | g | 124 | 93 | 155 | low | L02, L17, L28 | An assumed 80 g first flush (60–100) × 1.55, below Perak's "can reach" 150 g; a seller's claim of fruiting at 26–28 °C |
| Flushes, days to first harvest, days between flushes, rest and turnaround, blocks lost, labour | as the highland grower's | | | | low | L01 | |
| Electricity a month, per house | kWh | 146 | 126 | 146 | low | L37 | As the highland grower's |
| Transport to buyers | RM/kg | 0 | 0 | 2 | low | none | |
| Rent | RM/month | 0 | 0 | 4,000 | low | L01 | |
| House and racks, per house | RM | 5,000 | 1,300 | 10,000 | low | L01, G20–G23 | |
| Humidifier, per house | RM | 1,500 | 900 | 3,000 | low | L01 | |
| Fans, controller and wiring, per house | RM | 3,300 | 1,700 | 7,500 | low | L01 | |

### 1.8 Import and resell (black jelly, lion's mane)

| Figure | Crop | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|---|
| Landed price | Black jelly | RM/kg | 13.00 | 10.00 | 16.00 | low | J08, J09, J11, J29 | Not found: back-calculated from Chinese fresh black fungus at RM 18–24/kg retail. Dried imports (RM 30/kg dried, about RM 4.30 per fresh-equivalent kg at 7:1) are a different product: not compared |
| Landed price | Lion's mane | RM/kg | 40.86 | 26.53 | 53.12 | low | L09, G02, G13, G14 | USD 8.10 (one China transaction) × 4.057 + RM 8.00 freight, duty and handling (a placeholder). Low USD 5.16 (Taiwan average) × 4.057 + 5.60; high USD 10.53 × 4.057 + 10.40. Tridge prices are now behind a sign-up |
| Trading labour | both | h/day | 2 | 1.4 | 2.6 | low | none | Placeholder |
| Rent | both | RM/month | 0 | 0 | 4,000 | low | L01 | |

### 1.9 Not compared (left out of the comparison, with the reason the page shows)

| Crop | Way | Reason | Confidence | Sources |
|---|---|---|---|---|
| Grey oyster | Highland grower | Not grown commercially in the highlands: it fruits best at 25 °C, and Cameron Highlands averages 17.9 °C | medium | G31, G32, L16 |
| Grey oyster | Import and resell | Fresh grey oyster keeps 3–4 days and Malaysia grows its own; no import price found | medium | S06, P33 |
| Pink oyster | Highland grower | Below its 18–20 °C pinning floor: a highland grower would need heat and do worse than a lowland shed (about 0.6 × the shed yield, an estimate) | low | P24, P27, P28 |
| Pink oyster | Import and resell | It keeps 1–4 days; no record of fresh pink imports | medium | P25, P26, P33 |
| Black jelly | Highland grower | Growth slows sharply below 18 °C (about 30 % less than a lowland shed, an estimate); the cool strain (A. heimuer) has no Malaysian supply | low | J26, J27, J30 |
| Lion's mane | Lowland shed | Standard lion's mane fruits at 18–24 °C and a lowland shed runs 28–32 °C: the Warm strain is the lowland shed for this crop | medium | L15, L28 |
| Grey oyster, pink oyster, black jelly | Warm strain | Already warm crops | high | crop list |

## 2. Re-check of the October and model-page defaults (2026-11-06)

| Figure | Before | Now | Changed? | Sources | Note |
|---|---|---|---|---|---|
| Bought grey oyster block | RM 2.00 (1.50–2.80) | RM 2.00 (1.50–2.80) | Stands | G05, G06 | Same tiers posted 19 Jul 2026; a single mature block at RM 8 is retail |
| Grey oyster farm-gate | RM 10/kg (8–13) | RM 10/kg (8–13) | Stands | G04, G08, G09 | |
| Grey oyster retail | RM 16/kg (12–20) | RM 16/kg (12–25) | High end raised | G04, G07 | |
| Grey oyster shed yield | 170 g (100–300) | 170 g (100–300) | Stands | G07, G21 | |
| Lion's mane price | RM 50/kg (30–70) | RM 50/kg (30–70) | Stands | G10, G11, G15 | Retail evidence now RM 90–133/kg; no wholesale figure |
| Lion's mane block | RM 6 (3–10) | RM 6 (3–10) | Stands | G10 | |
| Lion's mane import | USD 8.10/kg (5.16–10.53) | Not re-verified | Unverified | G13, G14 | Tridge behind a sign-up; USD 5.67 (Mar 2026) is inside the range |
| Electricity | RM 0.551/kWh (0.515–0.591) | RM 0.5515 (0.515–0.596) | High end raised | G01, G19 | AFA Nov 2026 +3.60 sen (forecast was +4.27); Dec forecast +7.98 |
| Minimum wage | RM 1,700/month | RM 1,700 to May 2027, RM 2,000 from June 2027 | Future change | G17, G18 | SMEs under RM 50 million exempt |
| Daikin FTKF 2.5 hp | RM 3,940 | RM 4,170 | Changed | G16 | 1.0 hp RM 2,030; 1.5 hp RM 2,450; 2.0 hp RM 3,820 |
| USD to RM | 4.087 | 4.057 | Changed slightly | G02, G03 | |
| Shed build cost | RM 5,000 per 2,000 blocks, no source | RM 5,000 (1,300–10,000) | Now sourced | G20–G23, G26 | |
| Racks | RM 3,000 per 2,000 blocks, no source | RM 0.70 a block (0.20–1.30) | Changed | G21, G25, G33 | |
| Shed labour | 0.75 h per 1,000 blocks a day, no source | 0.75 (0.4–4) | Range widened | G07, G24 | Sheds report about one worker per 2,000 blocks (4 h per 1,000 a day); the default stays the owner-approved 0.75 |
| Packing | RM 0.50/kg (0.30–1.00) | RM 0.50/kg (0.20–2.00) | Range widened | G29, G30 | Bulk bags RM 0.20/kg; retail punnets RM 2.00/kg |
| Lion's mane in Cameron Highlands | not found | not found | No | G32 | |
| Grey oyster in the highlands | — | Not grown commercially there | New | G31, G32 | |
| Grey oyster cost of production | — | RM 5.30/kg (2013) | New, old | G08 | Historical only |

## 3. Pink oyster findings

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| Malaysian name and species | "Cendawan tiram merah jambu (Pleurotus flabellatus)" | current | MY (DOA) | P08 | Taken as P. djamor or close to it |
| Pink block, online | RM 4.50 (2–20 blocks) | undated | Johor | P04 | Price from a search summary |
| Pink block, 80 % grown | RM 3.50 | undated | MY | P05 | Search summary |
| Coloured-oyster grower's blocks | RM 2 each | 2022-12 | Pahang | P03 | Colour not stated |
| Pink yield per bag | 50–150 g per 1 kg bag (grey 400–500 g in the same table) | 2011, 2007 | MY | P06, P07 | |
| Pink fruiting | 30–32 °C, over 10–12 weeks; spawn run 25–30 days | 2011 | MY | P06, P07 | |
| Oysters (DOA) | 60–80 g a harvest × 6–8; pins 3–5 days after opening; rest at least 10 days; 28–30 °C; 3–4 days at 5–8 °C | current | MY (DOA) | P08 | Not pink-specific |
| Rest, then second flush | Rest 7–10 days, then picked 4–5 days after reopening | undated | Johor | P04 | Pink |
| Coloured-oyster farm-gate | RM 16/kg | 2020, 2022 | Pahang | P01, P02, P03 | |
| Pink retail, boutique | RM 45 per 450–500 g (about RM 90–100/kg); kit RM 30 "up to 200 g per flush", 2–3 flushes | 2026 | KL | P09 | |
| Pink retail | RM 30 per 300 g | about 2025 | Klang | P10 | Search summary |
| Pink as a hobby crop | Grown "for hobby" in Negeri Sembilan and Pahang; Malaysian oyster output 250–300 t a year, mostly grey | 2020–23 | MY | P11 | |
| Pink cycle, Indonesia | Spawn run 7–10 days; pins 2–5; fruit 3–5; 2 harvests 7 days apart | 2024-02 | ID | P16 | |
| Pink yield, trial | 58.8 g + 83.9 g over 2 flushes | 2022 | ID | P17 | |
| Thai pink | Block THB 10–15 (RM 1.25–1.88); wholesale THB 80–100/kg (RM 10–12.50); premium THB 670/kg | various | TH | P19–P23 | |
| Strain sheet | Pins 18–24 °C; fruits 18–28 °C; 2–3 flushes 10–12 days apart; 150–200 g per kg; dies below 8–10 °C | current | BE | P24 | |
| Shelf life | About 1 day at room temperature; 36 h room, 96 h chilled | 2020 | — | P25, P26 | |
| Fruiting floor | Not below 15 °C; under 20 °C pinning often fails | current | — | P27, P28 | |
| Flush shares | Flush 1 is 70–80 % of the total; 109 / 92 / 81 g per kg (Pakistan) | various | — | P29, P31 | |
| Imports | China supplies 38 % of world fresh oyster exports, Malaysia a top buyer (not pink) | 2022 | — | P33 | |
| Cameron Highlands | One farm lists a "Pink Mushroom" | 2013 | MY | P37 | No data |

## 4. Black jelly findings

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| Wholesale and retail | RM 30 / RM 40 a kg; more stable than oyster; dried and sold online in the rainy season | 2024-10 | Terengganu | J01 | |
| School project | 300 blocks; first harvest at 60 days; RM 30/kg to Pasar Jelawat | about 2020 | Kelantan | J02 | Search summary for the figures |
| Yield and timing | 150–200 g a 1 kg bag over 10–12 weeks; spawn run 25–35 days; fruiting 30–32 °C | 2014 | MY | J03 | Dried is the main product sold |
| BE on rubberwood | 80.9 % over 4 harvests | 2018 | MY (UM) | J05 | |
| UPM trial | 83–131 g over 3 flushes; pins 4–7 days; picked 6–10 days later | 2014 | MY | J06 | |
| Fresh retail, Chinese | RM 18–24/kg (Lotus's RM 3.99 per 200 g; Village Grocer; Jaya Grocer) | 2026 | MY | J08, J09, J11, J12 | |
| Fresh retail, Malaysian | RM 32.50/kg (Jaya Grocer) | 2026 | MY | J10 | |
| Dried retail | 1 kg packs RM 38–48; small packs RM 45–75/kg; local farm-dried about RM 200/kg | 2025–26 | MY | J14–J17 | |
| Indonesia | Fresh RM 2.34/kg; dried RM 15.6/kg; 5.5–6 : 1; 0.4–0.5 kg a baglog; flushes about 25 days apart | 2020–22 | ID | J21 | |
| Indonesia baglog | RM 0.57, 1.3 kg; 0.39 kg a baglog over 4–6 harvests | 2026-08 | ID | J22 | |
| Thailand | Block THB 4.50–13; fresh THB 63/kg; first harvest 25–30 days after opening | about 2023 | TH | J24, J25 | |
| China (A. cornea) | 18–33 °C (best 22–30); 3–4 flushes; about 18 days between; 8 : 1 fresh to dry; dried RM 20.6/kg; fresh RM 1.8–2.7/kg | 2018–26 | CN | J26–J29 | |
| Temperature types | A. heimuer 15–25 °C; low-temperature types 12–22 °C | — | CN | J30 | A highland niche, no Malaysian supply |
| Thai wild A. cornea | BE 72 %; 6 flushes in 3 months at 25 °C | 2020 | TH | J37 | |

## 5. Not found

| Gap | Next step |
|---|---|
| Malaysian wholesale or restaurant price for fresh pink oyster | Ask Shroomy, Mogoo Farm, Nadiya Agrofarm (Johor) and Pekan Mushroom Resources for a bulk quote |
| Bulk price for 500+ pink or black jelly blocks | Ask Nadiya Agrofarm, Cendawan Hub (Perlis), JAZ Agro (Tanjung Sepat) and the Pahang agriculture centre at Tanah Putih |
| Landed wholesale price of fresh Chinese black fungus | Ask Selayang wholesale traders; FAMA's price page |
| Pink and black jelly yield on Malaysian rubberwood blocks, shed against controlled | A trial of about 50 blocks each; the farm app records it (Your runs) |
| Loss, labour and shrink for pink and black jelly | Record them on the first runs |
| Lion's mane price in Cameron Highlands | Ask growers or stalls at Kea Farm |
| Import tonnage (HS 0709.59, 0712.32) | UN Comtrade, ITC Trade Map or DOSM |
| Fans, controller and shed misting at today's prices | Two local quotes |

## 6. Sources

| Id | Source | Date | Where | How read | What it says |
|---|---|---|---|---|---|
| APP | This repo: the crop-cycle simulation and the default program (fruiting 7 days, rest 10, 4 flushes) | 2026-10 | app | read | Energy per block, grey oyster 0.46 kWh; the program |
| S01 | <https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/> | 2026 | MY | search summary | Grey oyster blocks RM 2.80 / 2.50 / 2.30 by quantity |
| S03 | <https://siswazah-tani.blogspot.com/2020/11/jualan-bongkah-cendawan-tiram-kelabu.html> | 2020-11 | MY | fetched | Blocks RM 1.50 delivered for 1,000+ |
| S04 | <https://siswazah-tani.blogspot.com/2020/01/cara-mengira-kos-penghasilan-beg.html> | 2020-01 | MY | fetched | Own block RM 0.65 direct, RM 1.20 with overhead |
| S06 | <https://epengembangan.doa.gov.my/en/tanaman/komoditi-berpotensi/cendawan/> | undated | MY (DOA) | fetched | 60–80 g a harvest, 6–8 harvests, 10 d rest, 3–4 days chilled |
| S07 | <https://cendawanonline.wordpress.com/> | 2018-07 | MY | fetched | 180 g a block over 3 months; half fruit in the first flush; one person runs 1,000 blocks |
| S08 | <https://petani.my/cara-tanam-cendawan-tiram-di-rumah/> | undated | MY | search summary | 250–500 g a block (home growing) |
| S09 | <https://www.sciencedirect.com/science/article/pii/S0304423813003129> | 2013 | MY | search summary | 116–231 g a bag |
| S10 | <https://www.researchgate.net/publication/376638044_SCIPe_MARDI_Pakej_lengkap_untuk_industri_cendawan_tempatan_SCIPe_MARDI_A_complete_package_for_the_local_mushroom_industry> | about 2023 | MY (MARDI) | search summary | 149 g a bag (commercial strain) |
| S11 | <http://etmr.mardi.gov.my/index.php/25-abstract/2013/volume-8/57-daya-maju-perusahaan-cendawan-tiram-di-semenanjung-malaysia> | 2013 | MY (MARDI) | search summary | 6,000 blocks, 20 kg a day; farm price RM 10/kg |
| S12 | <https://www.utusanborneo.com.my/2025/12/20/pengusaha-tanaman-cendawan-tiram-mampu-meraih-pendapatan-lumayan> | 2025-12 | MY | fetched | 100,000 blocks, 3.4 t a month, about RM 9.40/kg |
| S14 | <https://www.sinarharian.com.my/article/257798/edisi/johor/cuaca-panas-pengeluaran-cendawan-tiram-terjejas> | 2023-05 | MY | fetched | Heat wave cut output 60 %; about RM 12/kg |
| S15 | <https://agrimag.my/en/article-details/pengeluaran-harian-300-kg-bekalan-cendawan-tiram-masih-kurang> | 2023-07 | MY | fetched | Wholesale above RM 10/kg; 6 flushes |
| S16 | <https://www.hargasekilo.my/harga-cendawan-tiram/> | 2026-04 | MY | fetched | Farm RM 10–15, wholesale 10–13, retail 15–20 a kg |
| S17 | <https://www.sciencedirect.com/science/article/pii/S2666154323004593> | 2023 | not MY | search summary | Controlled room +49 % oyster yield |
| S35 | <https://www.mytnb.com.my/ms-MY/business/understand-your-bill/pricing-tariff> | 2026 | MY (TNB) | fetched | Specific Agriculture tariff exists; RM 10 retail (unverified) |
| S42 | <https://duokai.en.made-in-china.com/product/ZdoteFAVELrT/China-CE-Approved-24-Liter-Per-Hour-Ultrasonic-Air-Humidifier-Industrial-Agriculture-Grow-Room-Mushroom-Fogger.html> | 2026 | CN | fetched | 3 L/h foggers USD 210–230; 6 L/h USD 290–340 |
| S44 | <https://pubmed.ncbi.nlm.nih.gov/39384289/> | 2024 | MY | search summary | Green mould on grey oyster can take a whole batch |
| S47 | <https://www.sinarharian.com.my/article/159472/edisi/cendawan-tiram-beri-pendapatan-lumayan-buat-suami-isteri> | 2021-09 | MY | fetched | Blocks last 3–4 months; RM 1.60 a block |
| L01 | Farm repository: the October defaults and the owner's earlier estimates (`docs/research/2026-10-09-economics-defaults.md` on `master`) | 2026-10 | repo | read | Block price, yield, losses, labour, equipment, write-off |
| L02 | <https://malaysiaaktif.my/2025/04/cendawan-kobis-bunga-tarik-perhatian-penduduk-seberang-perak> | 2025-04 | MY | fetched | Lion's mane up to 150 g a block; RM 70/kg; harvest in 11–13 days |
| L03 | <https://dusun.com.my/product/organic-local-fresh-lion-mane-200gm/> | 2026 | MY | fetched | RM 90, pack size unclear |
| L05 | <https://vegandistrict.my/products/lions-head-mushroom-100g> | 2026 | MY | fetched | RM 10 per 100 g |
| L06 | <https://www.mrfungus.com.my/> | 2026 | MY | fetched | Most farms import ready-to-fruit bags; about 10 days to harvest |
| L09 | <https://www.tridge.com/market-overview/fresh-lion-s-mane-mushroom> | 2026 | CN, TW | fetched | China USD 8.10/kg (Nov 2025); Taiwan average USD 5.16/kg |
| L10 | <https://finance.sina.com.cn/jjxw/2025-04-12/doc-inesvpzh4569524.shtml> | 2025-04 | CN | fetched | Bags 3 CNY; about 1 kg a bag |
| L13 | <https://www.nongji1958.com/index.php/node/61629> | 2023-10 | CN | fetched | 3 flushes, 400 g a bag |
| L14 | <https://europepmc.org/article/PMC/PMC10432537> | 2023 | TH | fetched | 113 g from a 750 g bottle at 16 °C |
| L15 | <https://archive.org/details/PaulStametsGrowingGourmetAndMedicinalMushrooms2000> | 1993 | — | fetched | Lion's mane fruits 18–24 °C; crops 14 days apart; 550 g from 2.27 kg |
| L16 | <https://en.wikipedia.org/wiki/Cameron_Highlands> | — | MY | fetched | Daily mean 17.9 °C, maximum 22.3 °C |
| L17 | <https://www.bewildersg.com/grow-kits/p/wr2za998wnnh7ueme24e1kxtntsa7k> | 2026 | SG | fetched | A warm-growing strain: 26–28 °C |
| L18 | <https://arusenerg.com/tnb-tariff-malaysia/> | 2026 | MY | fetched | LV non-domestic 50.68 sen/kWh; RM 20 a month |
| L19 | <https://www.mytnb.com.my/tariff/index.html?lang=en> | 2026 | MY (TNB) | fetched | The calculator's constants; no service tax for non-domestic |
| L21 | <https://gajiminimum.mohr.gov.my/wp-content/uploads/PUA%20376.pdf> | 2024 | MY | fetched | RM 1,700 a month, RM 8.72 an hour |
| L23 | <https://calculatormalaysia.com/harga/harga-aircond-malaysia/> | 2026 | MY | fetched | Fitting RM 250–350 by size |
| L26 | <https://journals.hh-publisher.com/index.php/AAFRJ/article/view/444> | 2021 | MY (MARDI) | fetched | Contamination under 2 % in a controlled house, over 10 % in ordinary houses |
| L28 | <https://www.out-grow.com/pages/lions-mane-warm-weather-hericium-erinaceus> | 2026 | US | fetched | Warm strain fruits at 21–27 °C; second flush 50–60 % of the first |
| L29 | <https://www.carousell.com.my/reefer-container/q/> | 2026-10 | MY | fetched | Used reefers RM 16,000–36,800 (40 ft), RM 23,500 (20 ft) |
| L31 | <https://dnelogistics.com.my/container-haulage-port-klang-rates-routes.html> | 2026 | MY | fetched | Haulage RM 350–950; side loader RM 150–350 |
| L35 | <https://www.mudah.my/selangor/shop-lot-for-rent> | 2026-10 | MY | fetched | Shoplots RM 3,800–5,000 a month |
| L36 | <https://www.shroomy-tek.com/products/lions-mane-grow-kit> | 2026 | MY | fetched | Grow kit RM 35 |
| L37 | Farm repository: `device/sim-model.js`, `device/sim-store.js` | 2026 | repo | read | Fans 60 W each; humidifier 40 W per L/h |
| L38 | `research/lions-mane-cooling.html` §06 (not committed) | 2026-10 | repo | read | Room electricity low 16.6 kWh a day, high 67.5; 29 blocks a m³ |
| P01 | <https://www.freemalaysiatoday.com/category/bahasa/2020/01/05/pesara-tentera-tanam-cendawan-tiram-warna-warni> | 2020-01 | MY | fetched | Coloured oyster RM 16/kg |
| P02 | <https://www.freemalaysiatoday.com/category/nation/2020/01/05/money-making-world-of-mokhtars-multi-coloured-mushrooms> | 2020-01 | MY | fetched | RM 16/kg; demand rising |
| P03 | <http://animhosnan.blogspot.com/2022/12/cendawan-tiram-warna-warni.html> | 2022-12 | MY | fetched | Blocks RM 2; RM 16/kg |
| P04 | <https://www.lazada.com.my/products/bongkah-cendawan-tiram-pink-i2426799976.html> | undated | MY | fetched; price from a search summary | Rest 7–10 days; RM 4.50 |
| P05 | <https://pgmall.my/p/U277/4281> | undated | MY | search summary | Pink block RM 3.50 |
| P06 | <http://zz-agro.blogspot.com/2011/11/cendawan-cendawan-berpotensi-di.html> | 2011 | MY | fetched | Pink 50–150 g a 1 kg bag; 10–12 weeks |
| P07 | <http://cendawanglobal.blogspot.com/2007/09/cendawan-merah-jambu.html> | 2007 | MY | fetched | As P06 |
| P08 | <https://epengembangan.doa.gov.my/en/tanaman/komoditi-berpotensi/> | current | MY (DOA) | fetched | Oyster yields, timing, storage |
| P09 | <https://www.shroomy-tek.com/> | 2026 | MY | fetched | Pink RM 45 per 450–500 g; kit RM 30 |
| P10 | <https://mogoofarm.com/> | about 2025 | MY | search summary | RM 30 per 300 g |
| P11 | <http://animagro.blogspot.com/2020/07/types-of-oyster-mushroom.html> | 2020 | MY | fetched | Pink a hobby crop |
| P14 | <https://www.supplybunny.com/en/products/oyster-mushroom-sold-per-kg-735d8cc4-fce1-4b9f-8926-7708282d22e6> | 2025–26 | MY | search summary | Grey to restaurants RM 21–24/kg |
| P16 | <https://trubus.id/jamur-tiram-merah-muda-dan-kuning-lezat-dan-bergizi/> | 2024-02 | ID | fetched | Pink cycle |
| P17 | <https://tpa.fateta.unand.ac.id/index.php/JTPA/article/view/621> | 2022 | ID | abstract fetched | 2 flushes, 59 and 84 g |
| P19 | <https://www.nanagarden.com/product/192564> | old | TH | search summary | Block THB 11; fresh THB 80/kg |
| P20 | <https://cecdchonburi.com/?product=quality-mushroom-spawn> | undated | TH | search summary | Blocks THB 10–15 |
| P21 | <https://cmpccoop.com/?portfolio=fresh-mushrooms-oyster-mushrooms-pink-gull-mushrooms-golden-oyster-mushrooms> | undated | TH | fetched | THB 100/kg wholesale; chilled delivery within 2 days |
| P22 | <https://smce2023.doae.go.th/product_detail.php?smce_id=650110810042&ps_id=6598> | about 2023 | TH | search summary | THB 80/kg |
| P24 | <https://mycelia.be/m2708-pleurotus-djamor/> | current | BE | fetched | Strain parameters |
| P25 | <https://en.wikipedia.org/wiki/Pleurotus_djamor> | current | — | fetched | Shelf life about 1 day |
| P26 | <https://www.ijcmas.com/9-11-2020/R.%20Kavipriya,%20et%20al.pdf> | 2020 | IN | search summary | 36 h room, 96 h chilled |
| P27 | <https://naturelion.ca/blog/pink-oyster-mushroom-guide> | current | CA | search summary | Not below 15 °C |
| P28 | <https://www.out-grow.com/blogs/growing-mushrooms/growing-pink-oyster-mushrooms-is-it-that-easy> | current | US | search summary | 20–28 °C |
| P29 | <https://lykyn.com/blogs/news/pink-oyster-grow-kit> | current | — | search summary | Flush 1 is 70–80 % |
| P30 | <https://www.shroomery.org/9406/Pleurotus-djamor> | current | — | search summary | 2 crops 7–10 days apart |
| P31 | <http://www.pakbs.org/pjbot/PDFs/44(1)/61.pdf> | 2012 | PK | search summary | 109 / 92 / 81 g per flush |
| P32 | <https://jabonline.in/abstract.php?article_id=1247&sts=2> | about 2024 | VN | search summary | 447 g a bag |
| P33 | <https://www.tridge.com/tridge-woods/fresh-oyster-mushroom/CN> | 2022–25 | CN | search summary | China's fresh oyster export share |
| P35 | <https://www.researchgate.net/publication/351265218_Determination_of_how_to_minimize_postharvest_losses_in_oyster_mushroom_Pleurotus_ostreatus> | about 2021 | — | search summary | 2–3 days at 30 °C |
| P37 | <https://kuanju.wordpress.com/2013/06/24/mushroom-farm-cameron-highlands/> | 2013 | MY | search summary | A "Pink Mushroom" in Cameron Highlands |
| J01 | <https://www.trdi.my/usahawan-cendawan-terengganu-rancang-tembusi-pasaran-eksport> | 2024-10 | MY | fetched | RM 30 / RM 40 a kg |
| J02 | <https://www.bernama.com/bm/news.php?id=1814697> | 2020-02 | MY | fetched (teaser) + search summary | School project figures |
| J03 | <http://animhosnan.blogspot.com/2014/07/cendawan-jeli-hitam-part-1.html> | 2014 | MY | fetched | Yield, timing, temperatures |
| J05 | <https://www.researchgate.net/publication/324673393_Antioxidant_Properties_and_Yield_of_Wood_Ear_Mushroom_Auricularia_polytricha_Agaricomycetes_Cultivated_on_Rubberwood_Sawdust> | 2018 | MY | search summary | BE 80.9 %, 4 harvests |
| J06 | <https://scialert.net/fulltext/?doi=ajps.2014.111.119> | 2014 | MY | fetched | UPM trial |
| J07 | <https://files01.core.ac.uk/download/pdf/268875774.pdf> | about 2013 | MY | search summary | High contamination |
| J08 | <https://www.lotuss.com.my/p/fresh-black-fungus-200g-75189332> | 2026-11 | MY | fetched | RM 3.99 per 200 g, Chinese |
| J09 | <https://vkg.bites.com.my/products/china-fresh-black-fungus-200g> | 2026 | MY | search summary | RM 3.60 per 200 g |
| J10 | <https://jgcj.jayagrocer.com/products/mushroom-vt-black-jelly-200g-mys> | 2026 | MY | search summary | RM 6.50 per 200 g, Malaysian |
| J11 | <https://klec.jayagrocer.com/products/black-fungus-mushroom-china-200g> | 2026 | MY | search summary | RM 4.80 per 200 g, Chinese |
| J12 | <https://www.doremi.my/fresh-black-fungus> | 2026 | MY | search summary | RM 3.50 per 200 g |
| J14 | <https://greatocean.my/product/1kg-black-fungus-qing-shui-%E6%B8%85%E6%B0%B4%E7%99%BD%E8%83%8C%E9%BB%91%E6%9C%A8%E8%80%B3-1kg/> | 2026 | MY | search summary | Dried 1 kg RM 38–48 |
| J15 | <https://www.nbsgrocery.com/showproducts/productid/3254283/cid/344643/goldenhorse-black-fungus-1kg-%E9%87%91%E9%A9%AC%E7%89%8C-%E9%BB%91%E6%9C%A8%E8%80%B3-kulat-hitam/> | 2026 | MY | search summary | Dried 1 kg RM 48 |
| J16 | <https://www.supplybunny.com/en/products/dried-black-fungus-cloud-ear-100g-sold-per-packet-cendawan-telinga-tikus> | 2026 | MY | search summary | 100 g RM 7.50 |
| J17 | <https://www.lazada.com.my/products/hot-sale-100-organic-high-quality-50-gram-dried-black-jelly-mushroom-from-farm-50-gram-cendawan-telinga-kera-kering-dari-ladang-i2449171754.html> | 2026 | MY | search summary | 50 g RM 10, farm-dried |
| J19 | <https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/> | 2026-07 | MY | search summary | Oyster blocks RM 2.30–2.80 |
| J21 | <https://trubus.id/berdaya-karena-jamur-kuping/> | 2020–22 | ID | fetched | Yields, flushes, prices, dry ratio |
| J22 | <https://masoemuniversity.ac.id/artikel/memulai-bisnis-jamur-kuping-dari-budidaya-hingga-menjadi-pemasok-pasar/> | 2026-08 | ID | fetched | Baglog price, weight, yield |
| J24 | <https://www.khaosod.co.th/technologychaoban/featured/article_259400> | about 2023 | TH | search summary | Block THB 4.50–5; THB 63/kg |
| J25 | <https://www.nanagarden.com/tag/%E0%B9%80%E0%B8%AB%E0%B9%87%E0%B8%94%E0%B8%AB%E0%B8%B9%E0%B8%AB%E0%B8%99%E0%B8%B9> | various | TH | search summary | Block prices; 200 g over 3 harvests |
| J26 | <https://www.kepuchina.cn/xc/201809/t20180918_733231.shtml> | 2018 | CN | fetched | A. cornea cultivation |
| J27 | <https://www.cnhnb.com/xt/article-113868.html> | various | CN | search summary | Temperature, yield, 8 : 1 |
| J29 | <https://www.cnhnb.com/p/muer-0-0-15303-0-1/> | 2025–26 | CN | search summary | Fresh 2.20 CNY a jin |
| J30 | <https://news.ymt.com/new_arg_tech/eEoeFH6B> | — | CN | search summary | A. heimuer temperature types |
| J32 | <https://www.vietworldkitchen.com/blog/2026/05/wood-ear-mushroom-and-black-fungus-a-beginners-guide-to-buying-prepping-and-cooking.html> | 2026-05 | — | search summary | Shelf life |
| J37 | <https://www.researchgate.net/publication/340806952_Cultivation_of_a_wild_strain_of_Auricularia_cornea_from_Thailand> | 2020 | TH | search summary | BE 72 %, 6 flushes |
| G01 | <https://paultan.org/2026/11/02/tnb-bill-afa-rate-november-2026-set-at-3-60-sen-kwh/> | 2026-11-02 | MY | fetched | AFA Nov +3.60; Dec forecast +7.98 |
| G02 | <https://www.bnm.gov.my/kuala-lumpur-usd/myr-reference-rate> | 2026-11-06 | MY | fetched | USD/MYR 4.0573 |
| G03 | <https://www.investing.com/currencies/usd-myr-historical-data> | 2026-11-06 | — | search summary | USD/MYR 4.0595 |
| G04 | <https://www.hargasekilo.my/harga-cendawan-tiram/> | 2026-04-10 | MY | fetched | Oyster prices as S16 |
| G05 | As S01 | 2026-07-19 | MY | search summary | Same tiers |
| G06 | <https://www.mudah.my/bongkah-cendawan-tiram-kelabu-matang100-115559660.htm> | 2026 | MY | search summary | RM 8 a mature block |
| G07 | <https://www.utusan.com.my/nasional/2026/11/cendawan-ubah-hidup-bekas-tukang-binaan/> | 2026-11-05 | MY | fetched | 3,000 blocks run by 2 people; RM 22/kg |
| G08 | As S11 | 2013 | MY | search summary | Cost RM 5.30/kg |
| G09 | As S15 | 2023-07 | MY | fetched | Sold in 1 and 2 kg bags |
| G10 | <https://www.shroomy-tek.com/> | 2026 | MY | fetched | Lion's mane from RM 60 per 450–500 g; kit RM 35 |
| G11 | As L03 | undated | MY | fetched | RM 90, size unclear |
| G13 | <https://www.tridge.com/intelligences/lions-mane-mushroom/price> | 2026-10-29 | — | fetched | Prices behind a sign-up |
| G14 | <https://www.tridge.com/market-overview/fresh-lion-s-mane-mushroom#price> | 2026-07 | — | search summary | USD 5.67/kg (Mar 2026) |
| G15 | As L05 | undated | MY | search summary | Clearance |
| G16 | <https://www.daikin.com.my/products/residential/wall-mounted/ftkf-series> | 2026-11-06 | MY | fetched | FTKF 2.5 hp RM 4,170 |
| G17 | <https://www.thestar.com.my/news/nation/2026/10/09/budget-2027-minimum-wage-to-rise-to-rm2000-from-june-2027-says-anwar> | 2026-10-09 | MY | fetched | RM 2,000 from June 2027 |
| G18 | <https://www.maukerja.my/career-advice/blog/ms/34016/gaji-minimum-malaysia> | 2026-10-27 | MY | fetched | Not yet gazetted |
| G19 | <https://cobler.io/blog/your-tnb-bill-line-by-line> | 2026 | MY | search summary | LV non-domestic rates |
| G20 | <http://lemushroom.blogspot.com/2010/05/mesin-mixer-dan-bagging-bag-cendawan-2.html> | about 2010 | MY | fetched | House package RM 5,500 for 5,000 bags |
| G21 | <http://animhosnan.blogspot.com/2018/06/agrimaths-cendawan-part-12.html> | 2018-06 | MY | fetched | Iron rack RM 250 for 350 blocks |
| G22 | <https://harizamrry.wordpress.com/2008/01/29/bantuan-dan-insentif-dalam-industri-cendawan/> | 2008-01 | MY | search summary | RM 16,000 for a 6,000-bag house |
| G23 | <https://dewan.selangor.gov.my/question/pertanian-13/> | 2012–14 | MY | search summary | RM 20,000 grants incl. mushroom houses |
| G24 | <https://www.peraksejahtera.com/dari-kokpit-ke-kebun/> | 2026-05 | MY | fetched | 60,000 blocks; a mother and "several workers" |
| G25 | <https://www.lazada.com.my/products/installation-rak-tinggi-cendawan-tiram-7-14-days-delivery-i4044543166.html> | undated | MY | search summary | Rack RM 200 for 500–1,000 blocks |
| G26 | <https://www.pjk.edu.my/penerbitanPJK/9.%20AGRO%20-%20FatihahAidaZalina.pdf> | undated | MY | search summary | A 3 × 3 m house holds 1,000–2,000 bags |
| G27 | <http://ursagro.blogspot.com/2009/02/pemasangan-misting-system.html> | 2009-02 | MY | search summary | Misting system nearly RM 1,500 |
| G28 | <https://saidinafurniture.com/product/mist-fan/> | undated | MY | search summary | Mist fan RM 2,367 |
| G29 | <https://my.biggo.com/s/punnet/> | 2026-11-06 | MY | fetched | Punnets RM 0.32–0.55 each |
| G30 | <https://abiagro.com.my/plastik-pembalut-buah/> | about 2020 | MY | search summary | Bags RM 18 per 100 |
| G31 | <https://www.researchgate.net/publication/306522802_Comparative_Study_of_Fruiting_Body_Production_of_some_Oyster_Mushroom_in_Two_Different_Temperatures> | undated | not MY | search summary | P. pulmonarius best at 25 °C, not 18 °C |
| G32 | <https://www.thevibes.com/index.php/articles/lifestyles/84354/Teacher-turned-entrepreneur-extolls-virtues-of-mushrooms-as-unexplored-commodity> | undated | MY | search summary | Highland growers grow shiitake and white oyster |
| G33 | <https://www.mudah.my/rak-cendawan-109639455.htm> | undated | MY | search summary | Used rack RM 450 |

# Economics defaults for the farm calculator

| Item | Value |
|---|---|
| Date | 2026-10-09 |
| Purpose | Default numbers for the "plan before building" economics part: profit per block, per cycle and per month; controlled room vs traditional shed; payback on equipment |
| Machine-readable copy | `docs/research/2026-10-09-economics-defaults.json` (same defaults, low/high, source ids) |
| Confidence key | high = several recent Malaysian sources agree; medium = one or two Malaysian sources, or a clear official figure; low = estimate, old, or not Malaysian |
| Marks | "Not MY" = not a Malaysian source. "Unverified" = no source found, or seen only in a search-engine summary and not on the page itself. Source ids (S01...) are listed in section 7 |
| Exchange rates | RM4.3 per USD, RM0.60 per CNY. Approximate, not checked |
| Search limit | The shared web-search budget ran out part way. Fan prices, shed build cost, labour hours, contamination rates, Cameron Highlands prices and a Malaysian lion's mane block price were not found (section 6) |

## 1. Recommended defaults

| Input | Unit | Default | Low | High | Confidence | Sources | Note |
|---|---|---|---|---|---|---|---|
| Bought grey oyster block (`block.price.oyster.bought`) | RM/block | 2 | 1.5 | 2.8 | medium | S01, S02, S03, S47 | Bulk 1000+ delivered. Small lots RM2.80-4.00. |
| Own-made grey oyster block (all-in) (`block.price.oyster.own`) | RM/block | 1 | 0.7 | 1.5 | low | S04, S05 | 2016-2020 costs; RM0.65 direct + up to RM0.50 overhead. Not inflated to 2026. |
| Bought lion's mane block (imported, landed) (`block.price.lionsmane.bought`) | RM/block | 6 | 3 | 10 | low | S20, S32, S23 | No Malaysian price found. China cost about 3 CNY (about RM1.80) per bag; adds freight, duty, margin, losses. Estimate. |
| Own-made lion's mane block (`block.price.lionsmane.own`) | RM/block | 2.5 | 1.5 | 4 | low | S04, S20, S23 | Estimate: more bran and full sterilisation than oyster. Unverified. |
| Grey oyster block wet weight (`block.weight.oyster`) | kg | 0.7 | 0.5 | 1 | medium | S05 |  |
| Lion's mane block wet weight (`block.weight.lionsmane`) | kg | 1 | 0.75 | 1.5 | low | S19, S48 | Not Malaysian. Ask the supplier. |
| Grey oyster yield, traditional shed, per good block, whole life (`yield.oyster.shed`) | g/block | 170 | 100 | 300 | medium | S06, S07, S08, S09, S10, S11, S12, S15 | Farm data (S11, S12, S15) point to 100-150 g; guides claim 250-640 g. |
| Grey oyster yield gain, controlled room over shed (`yield.oyster.controlledGain`) | % | 40 | 20 | 100 | low | S17, S14, S15 | S17 not Malaysian (+49 %). Hot spells cut shed output 50-60 % (S14), peak:off season 3:1 (S15). |
| Lion's mane yield, controlled room, per good block, all flushes (`yield.lionsmane.controlled`) | g/block | 250 | 150 | 400 | low | S18, S19, S22, S20, S48 | Malaysian 150 g (S18, warm room); Shandong factory 400 g (S22); depends on block size. |
| Grey oyster flushes, shed (`flushes.oyster.shed`) | flushes | 6 | 4 | 8 | medium | S06, S07, S15 |  |
| Grey oyster flushes, controlled (`flushes.oyster.controlled`) | flushes | 4 | 3 | 6 | medium | APP | App default program. |
| Lion's mane flushes (`flushes.lionsmane`) | flushes | 2 | 1 | 3 | medium | R08, S19, S22 |  |
| Grey oyster block life in shed (ready-to-fruit) (`cycle.oyster.shed`) | days | 90 | 75 | 120 | medium | S07, S47, S06 |  |
| Grey oyster block life, controlled (ready-to-fruit) (`cycle.oyster.controlled`) | days | 60 | 50 | 80 | medium | APP | App default 58 d. |
| Lion's mane block life, controlled (ready-to-fruit) (`cycle.lionsmane`) | days | 42 | 35 | 56 | low | S18, S23, R08 | First harvest 10-13 d, rest 7-14 d, second flush. |
| Grey oyster farm-gate / wholesale (`price.oyster.farmgate`) | RM/kg | 10 | 8 | 13 | high | S16, S15, S12, S14, S47, S11 |  |
| Grey oyster retail (`price.oyster.retail`) | RM/kg | 16 | 12 | 20 | medium | S16, S07 |  |
| Lion's mane fresh, farm-gate / wholesale (`price.lionsmane.wholesale`) | RM/kg | 50 | 30 | 70 | low | S18, S21, S30, S26, S28 | Only Malaysian farm price found: RM70 direct sale (S18). Chinese and Taiwanese export prices are RM25-40/kg. |
| Lion's mane fresh, retail (`price.lionsmane.retail`) | RM/kg | 100 | 85 | 117 | medium | S26, S28, S25 |  |
| Lion's mane dried (imported), retail (`price.lionsmane.dried.retail`) | RM/kg | 149 | 100 | 150 | low | S29 | One listing. |
| Lion's mane fresh-to-dry weight ratio (`ratio.lionsmane.freshToDry`) | kg/kg | 4.9 | 4.5 | 10 | low | S19 | Oven-dry figure; commercial drying keeps more water. Not Malaysian. |
| Electricity, all-in per kWh (`tariff.rmPerKwh`) | RM/kWh | 0.55 | 0.48 | 0.6 | medium | S33, S34, S35, S36 | LV General 50.68 sen + AFA 3.61 + KWTBB 1.6 % = 55.2 sen. Low = Specific Agriculture tariff if eligible (unverified). High = Jan 2027 AFA forecast. App uses 0.57. |
| Electricity fixed retail charge (`tariff.retailCharge`) | RM/month | 20 | 10 | 20 | medium | S33, S35 | RM10 for Specific Agriculture (unverified). |
| Grey oyster climate electricity, controlled (`energy.oyster.controlled`) | kWh/block | 0.46 | 0.4 | 0.55 | medium | APP | RM0.26 at RM0.57 = 0.46 kWh. Range is a guess around the sim. |
| Lion's mane climate electricity, controlled (`energy.lionsmane.controlled`) | kWh/block | 0.96 | 0.7 | 1.23 | medium | APP | RM0.40-0.70 at RM0.57. |
| Shed electricity (pump, lights) (`energy.shed`) | RM/block | 0 | 0 | 0.05 | low | S07 | Manual misting assumed. |
| PU panel 50 mm, supplied and installed (`capex.panel.50`) | RM/m2 | 220 | 150 | 380 | low | S40, S41, S39 | Derived: China FOB USD 13-22/m2 x 4.3 x about 2.5; checked against whole-room prices (S39). Get a local quote. |
| PU panel 75 mm, supplied and installed (`capex.panel.75`) | RM/m2 | 250 | 170 | 400 | low | S40, S41, S39 | As above. |
| PU panel 100 mm, supplied and installed (`capex.panel.100`) | RM/m2 | 280 | 190 | 425 | low | S40, S41, S39 | As above. |
| Split AC 1.0 hp inverter, unit (`capex.ac.1.0.inv`) | RM | 1,490 | 1,098 | 1,639 | high | S37 |  |
| Split AC 1.5 hp inverter, unit (`capex.ac.1.5.inv`) | RM | 1,780 | 1,317 | 1,929 | high | S37 |  |
| Split AC 2.0 hp inverter, unit (`capex.ac.2.0.inv`) | RM | 3,000 | 2,999 | 3,079 | high | S37 |  |
| Split AC 2.5 hp inverter, unit (`capex.ac.2.5.inv`) | RM | 3,940 | 3,940 | 3,940 | medium | S38 | One brand. |
| Split AC 3.0 hp inverter, unit (`capex.ac.3.0.inv`) | RM | 4,560 | 4,560 | 4,560 | medium | S38 | One brand. |
| Split AC 1.0 hp non-inverter, unit (`capex.ac.1.0.non`) | RM | 1,089 | 869 | 1,109 | high | S37 |  |
| Split AC 1.5 hp non-inverter, unit (`capex.ac.1.5.non`) | RM | 1,399 | 1,153 | 1,549 | high | S37 |  |
| Split AC 2.0 hp non-inverter, unit (`capex.ac.2.0.non`) | RM | 1,955 | 1,955 | 1,955 | medium | S37 | One model. |
| Split AC installation (10 ft pipe, wiring) (`capex.ac.install`) | RM | 280 | 250 | 350 | medium | S37 | 1.0 hp 250, 1.5 hp 280, 2.0 hp 310, 2.5 hp 350. |
| Ultrasonic fogger 3-6 L/h, landed and fitted (`capex.fogger`) | RM | 1,500 | 900 | 3,000 | low | S42 | China FOB USD 210-340 plus shipping and fitting. Estimate. |
| Intake + exhaust fan pair with dampers, 1800 m3/h (`capex.airPair`) | RM | 800 | 400 | 2,000 | low | none | No source found. Unverified. |
| Controller, sensors, relays (`capex.controller`) | RM | 1,500 | 800 | 3,000 | low | none | No source found. Unverified. |
| Racks for 2000 blocks (`capex.racks`) | RM | 3,000 | 1,500 | 5,000 | low | none | No source found. Unverified. |
| Electrical work for a controlled room (`capex.electrical`) | RM | 1,000 | 500 | 2,500 | low | none | No source found. Unverified. |
| Traditional shed for 2000 blocks, with racks (`capex.shed`) | RM | 5,000 | 3,000 | 10,000 | low | none | No source found. Unverified. |
| Equipment write-off period (`capex.lifeMonths`) | months | 60 | 36 | 120 | low | none | Assumption. No interest. |
| Minimum wage (`labour.minWage`) | RM/month | 1,700 | 1,700 | 1,700 | high | S43 | All employers from 2025-08-01. |
| Labour cost to employer (`labour.costPerHour`) | RM/h | 10 | 8.72 | 12 | medium | S43 | RM8.72/h minimum plus about 15 % employer contributions (EPF, SOCSO, EIS: unverified). |
| Grey oyster labour (`labour.oyster.hPer1000PerDay`) | h per 1000 blocks per day | 0.75 | 0.4 | 1.5 | low | S07 | Unverified estimate. |
| Lion's mane labour (incl. trimming, packing) (`labour.lionsmane.hPer1000PerDay`) | h per 1000 blocks per day | 1 | 0.5 | 2 | low | none | Unverified estimate. |
| Grey oyster blocks lost (contamination, no fruit), shed (`loss.oyster.shed`) | % | 10 | 5 | 50 | low | S07, S44 | S07: only about half fruit in the first flush. |
| Grey oyster blocks lost, controlled (`loss.oyster.controlled`) | % | 5 | 2 | 15 | low | S44 | Estimate. |
| Lion's mane blocks lost (bought) (`loss.lionsmane`) | % | 10 | 5 | 25 | low | none | Estimate. Imported blocks travel far. |
| Grey oyster shrink, harvest to sale (`shrink.oyster`) | % | 5 | 2 | 15 | low | S06 | Estimate; 3-4 days cold-store life. |
| Lion's mane shrink, harvest to sale (incl. trim, unsold) (`shrink.lionsmane`) | % | 10 | 5 | 20 | low | S18 | Estimate; 1 week in fridge, 2 h outside. |
| Packing and delivery, grey oyster (`sellCost.oyster`) | RM/kg | 0.5 | 0.3 | 1 | low | none | Unverified. |
| Packing and delivery, lion's mane (`sellCost.lionsmane`) | RM/kg | 3 | 1.5 | 5 | low | S24 | Unverified; S24 charges delivery to buyers. |
| USD to RM (`fx.usd`) | RM/USD | 4.3 | 4.1 | 4.5 | low | none | Approximate; not checked. |
| CNY to RM (`fx.cny`) | RM/CNY | 0.6 | 0.57 | 0.63 | low | none | Approximate; not checked. |

## 2. Findings by topic

### 2.1 Blocks

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| Bought grey oyster block, by quantity | RM2.80 (1-50), RM2.50 (51-250), RM2.30 (251+) | 2026 | Johor | S01 | Unverified (search summary) |
| Bought grey oyster block, bulk | From RM1.50, delivered | undated | Peninsula | S02 | Unverified (search summary) |
| Bought grey oyster block, bulk | RM1.50 for 1000+, delivered; RM3-4 in small packs | 2020 | Peninsula | S03 | |
| Bought grey oyster block | RM1.60 | 2021 | Peninsula | S47 | |
| Own grey oyster block, direct cost | RM0.65 (sawdust 0.10, bran 0.024, lime 0.002, PP bag 0.067, gas 0.044, spawn 0.05, neck and cap 0.20, wages 0.15) | 2020 | MY | S04 | Rounded up to RM0.70 by the author |
| Own grey oyster block, with overhead | RM1.20 (RM0.70 + RM0.50 overhead) | 2020 | MY | S04 | Below RM1.00 if near raw materials, own land |
| Own grey oyster block, 7000-bag batch | RM0.62 per bag; bag 600-700 g | 2016 | MY | S05 | Unverified (search summary) |
| Grey oyster block recipe | Sawdust : bran : lime 100:1:1, 60-65 % moisture, 5 g spawn, steam 7-12 h at 100 C | undated | MY (DOA) | S06 | Steamed, not autoclaved |
| Lion's mane block, Malaysia | No price found. Most Malaysian lion's mane farms import ready-to-fruit bags | 2026 | MY | S23 | The farm's own statement |
| Lion's mane bag cost, China | 3 CNY (about RM1.80) per bag, supplied to contract growers | 2025 | Not MY (CN) | S20 | Before freight, duty, margin |
| Lion's mane "bags", China B2B | USD 2.20-2.90 (about RM9.50-12.50), MOQ 500 | undated | Not MY (CN) | S32 | Unverified; product type not confirmed |
| Lion's mane block weight | 750 g wet bottle (TH); 3.3 kg block (UK) | 2023, 2026 | Not MY | S19, S48 | Ask the supplier |

### 2.2 Yield and cycle

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| Grey oyster per harvest, official guide | 60-80 g per bag per harvest, 6-8 harvests | undated | MY (DOA) | S06 | Implies 360-640 g per bag; farm data is far lower |
| Grey oyster, grower blog | 180 g per block over 3 months (6 harvests); only about half the blocks fruit in the first flush | 2018 | MY | S07 | |
| Grey oyster, home guide | 250-500 g per block over its life | undated | MY | S08 | Unverified (search summary) |
| Grey oyster, research | 231 g per bag (liquid spawn), 116 g (grain spawn); 270 g dry substrate; 3 harvests | 2013 | MY | S09 | Unverified (search summary) |
| Grey oyster, MARDI strain trial | 149 g per bag (commercial strain), 102-139 g (new strains) | about 2023 | MY | S10 | Unverified (page blocked) |
| Grey oyster, Bintulu farm | 100,000 blocks, 3.4 t per month: about 100-140 g per block if blocks last 3-4 months | 2025 | MY | S12 | Derived |
| Grey oyster, Selangor farm | 180,000 blocks; 300 kg/day peak, 100 kg/day off season; 6 flushes; 45-day spawn run | 2023 | MY | S15 | Peak to off-season 3:1 |
| Grey oyster, typical small farm | 6000 blocks, 20 kg per day | 2013 | MY (MARDI) | S11 | Unverified (search summary) |
| Grey oyster, heat wave | 40,000 blocks: 20 kg/day fell to 8 kg/day at 34 C (was 30 C max) | 2023 | MY (Johor) | S14 | 60 % drop |
| Grey oyster, controlled vs traditional room | +49 % yield over three seasons | 2023 | Not MY (country not checked) | S17 | Unverified (search summary) |
| Grey oyster block life, shed | 3-4 months | 2018, 2021 | MY | S07, S47 | |
| Grey oyster block life, controlled | 58 days (4 flushes, ready-to-fruit) | 2026 | App | APP | Default program |
| Lion's mane, Malaysian smart house | Up to 150 g per block; harvest in 11-13 days; room 24-28 C | 2025 | MY (Perak) | S18 | Warm room; a cold room should do better |
| Lion's mane, Thai commercial farm | 113 g per 750 g bottle, single harvest, 16 C; BE 42.6 % | 2018-19 | Not MY (TH) | S19 | |
| Lion's mane, Chinese factory | 3 flushes, 400 g per bag, over 50 days | 2023 | Not MY (CN) | S22 | |
| Lion's mane, Chinese contract growers | About 1 kg per bag | 2025 | Not MY (CN) | S20 | Bag size unknown, likely large |
| Lion's mane, UK block | 1.1 kg from a 3.3 kg block over 3 harvests | 2026 | Not MY (UK) | S48 | Unverified (search summary) |
| Lion's mane cycle | First harvest about 10 days after entering the fruiting room | 2026 | MY (KL) | S23 | |
| Lion's mane flushes and rest | 2-3 flushes, 7-14 days rest, second flush 50-60 % of the first | 2026 | Not MY | R08 | Earlier sweep |

### 2.3 Prices

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| Grey oyster, farm | RM10-15/kg | 2026-04 | MY | S16 | Price site; no method given |
| Grey oyster, farm wholesale | RM10-13/kg | 2026-04 | MY | S16 | |
| Grey oyster, wet market | RM12-18/kg | 2026-04 | MY | S16 | |
| Grey oyster, supermarket | RM15-20/kg | 2026-04 | MY | S16 | |
| Grey oyster, wholesale | Above RM10/kg | 2023 | MY (Selangor) | S15 | |
| Grey oyster, Bintulu farm | About RM9.40/kg (RM32,000 for 3.4 t) | 2025 | MY | S12 | Derived |
| Grey oyster, Johor farm | About RM12/kg | 2023 | MY | S14 | |
| Grey oyster, farm price | RM10/kg; cost RM5.30/kg | 2013 | MY (MARDI) | S11 | Unverified (search summary); old |
| Lion's mane, Malaysian farm direct | RM70/kg; RM10 for a 2-cluster pack | 2025-04 | MY (Perak) | S18 | Only Malaysian farm price found |
| Lion's mane, retail fresh | RM90 (organic, pack size unclear); RM100/kg (100 g RM10); RM117/kg (300 g RM35) | 2026 | MY | S26, S28, S25 | |
| Lion's mane, frozen | RM62-69/kg (400 g RM25, 800 g RM55) | 2026 | MY | S27 | |
| Lion's mane, dried (imported from China) | About RM149/kg (80 g RM11.90) | undated | MY | S29 | Unverified (search summary) |
| Lion's mane, China farm | 30 CNY per jin = 60 CNY/kg (about RM36/kg) | 2024 | Not MY (CN) | S21 | |
| Lion's mane, China contract buy-back | 12-16 CNY/kg (about RM7-10/kg) | 2025 | Not MY (CN) | S20 | Floor price |
| Lion's mane, Taiwan export | About USD 5.7/kg (about RM25/kg) | 2026-03 | Not MY (TW) | S30 | |
| Lion's mane, China export deal | USD 8.10/kg (about RM35/kg), 300 kg | 2025-11 | Not MY (CN) | S30 | |
| Lion's mane powder, Malaysian export | USD 254.94/kg (one shipment) | 2025-10 | MY | S31 | Processed product |
| Cameron Highlands lion's mane | Not found. Farms there grow it (traveller reports), no prices online | 2026 | MY | none | Open question |
| FAMA / DOA price data | Not found online for grey oyster or lion's mane | 2026 | MY | none | Open question |

### 2.4 Electricity

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| LV General (non-domestic) energy charge | 27.03 sen/kWh | from 2025-07-01 | MY (TNB) | S33 | Fixed until 2027-12-31 |
| LV General capacity charge | 8.83 sen/kWh | from 2025-07-01 | MY (TNB) | S33 | |
| LV General network charge | 14.82 sen/kWh | from 2025-07-01 | MY (TNB) | S33 | |
| LV General total before AFA | 50.68 sen/kWh, plus RM20/month retail | from 2025-07-01 | MY (TNB) | S33 | |
| LV ToU option (non-domestic) | Energy 28.52 peak (weekdays 2 pm-10 pm), 24.43 off-peak; capacity and network as above | from 2025-07-01 | MY (TNB) | S33 | A cold room runs nights; may save about 2 sen/kWh |
| AFA (fuel surcharge) | +3.61 sen/kWh (Oct 2026); forecast +4.27 Nov, +4.46 Dec, +7.59 Jan 2027 | 2026-10 | MY | S34 | Monthly; was negative in Jan-Apr 2026 |
| KWTBB (renewable levy) | 1.6 % of the bill | 2026 | MY | S36 | Unverified (search summary) |
| Service tax 8 % | Domestic only; not on non-domestic supply | 2026 | MY | S36 | Unverified (search summary) |
| All-in LV General, Oct 2026 | (50.68 + 3.61) x 1.016 = 55.2 sen/kWh | 2026-10 | MY | S33, S34, S36 | Derived; the app's 0.57 is close |
| Specific Agriculture LV tariff | Exists, replaces old Tariff H. Rates 27.03 + 6.19 + 11.19 = 44.41 sen/kWh, RM10 retail | from 2025-07-01 | MY (TNB) | S35 | Rates unverified (search summary only). All-in about 48.8 sen. Eligibility of a mushroom farm unknown |
| Old Tariff H (agriculture) | 39.00 sen first 200 kWh, 47.20 sen above | 2014-2025 | MY (TNB) | S35 | Unverified (search summary) |

### 2.5 Room build

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| PU cold-room panel 50 mm | USD 13-17/m2 FOB, MOQ 100 m2 | undated | Not MY (CN) | S40 | Unverified (search summary) |
| PU cold-room panel 100 mm | USD 19-22/m2 FOB | undated | Not MY (CN) | S40 | Unverified (search summary) |
| PU panel 50-200 mm | USD 17.50-22.00/m2 FOB by quantity | undated | Not MY (CN) | S41 | Unverified (search summary) |
| Malaysian PU panel makers | Teck Chuan (Penang, KL), BRD, Mech Ref, Thermofoam: quote only, no list prices | 2026 | MY | none | Ask for 50/75/100 mm quotes |
| Whole cold room, installed | 3x3 m RM18,000-35,000; 5x4 m RM30,000-55,000 (incl. refrigeration) | 2026-07 | MY (vendor) | S39 | Implies RM190-425/m2 for panels, door and fitting |
| Panel thickness rule | 50 mm for rooms at +5 C or warmer; 75 mm to -5 C; 100 mm to -25 C | 2026 | Vendor | S39 | 50 mm is enough for 18-22 C; thicker cuts AC load |
| Split AC 1.0 hp | Non-inverter RM869-1,109; inverter RM1,098-1,639 | 2026 | MY | S37 | |
| Split AC 1.5 hp | Non-inverter RM1,153-1,549; inverter RM1,317-1,929 | 2026 | MY | S37 | |
| Split AC 2.0 hp | Non-inverter RM1,955; inverter RM2,999-3,079 | 2026 | MY | S37 | |
| Split AC 2.5 hp, 3.0 hp | Inverter RM3,940; RM4,560 (Daikin FTKF) | 2026 | MY | S38 | One brand |
| Ceiling cassette 4-5 hp | RM8,510 (4 hp); RM5,999-9,780 (5 hp) | 2026 | MY | R08 | Retailer pages, no stable URL |
| AC installation | RM250 (1 hp), 280 (1.5 hp), 310 (2 hp), 350 (2.5 hp); 10 ft pipe, standard wiring | 2026 | MY | S37 | |
| Ultrasonic fogger | 3 L/h USD 210-230; 6 L/h USD 290-340; 24 L/h USD 880-920 (2.4 kW) | 2026 | Not MY (CN) | S42 | FOB; add shipping |
| Fans (intake + exhaust, dampers) | Not found | | | none | Unverified default RM800 |
| Traditional shed | Not found | | | none | Unverified default RM5,000 per 2000 blocks |

### 2.6 Labour

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| Minimum wage | RM1,700/month for all employers from 2025-08-01 (RM1,500 before) | 2025-07 | MY | S43 | Unverified (search summary) but widely reported |
| Minimum hourly rate | RM8.72/h; daily RM65.38 (6-day week) | 2025 | MY | S43 | |
| Employer contributions | About 15 % on top (EPF, SOCSO, EIS) | | MY | none | Unverified; not searched |
| Blocks per person | One person can run 1000 blocks alone | 2018 | MY | S07 | Part-time scale |
| Hours per 1000 blocks | Not found | | | none | Unverified default 0.75 h/day (oyster), 1.0 h/day (lion's mane) |

### 2.7 Losses

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| First-flush failure, grey oyster | About 50 % of blocks fruit in the first flush (spawn and weather) | 2018 | MY | S07 | Grower blog |
| Green mould (Trichoderma) | Sources: water, air in the house, cleaning tools; can wipe out a batch | 2024 | MY | S44 | Unverified (search summary) |
| Count yield over all blocks | Yield should be total kg over all blocks put in, not only healthy ones | undated | MY | S49 | Unverified (search summary) |
| Grey oyster shelf life | 3-4 days at 5-8 C | undated | MY (DOA) | S06 | |
| Lion's mane shelf life | About 1 week in the fridge, 2 hours outside; drier needed for surplus | 2025 | MY | S18 | |
| Contamination rate of bought blocks | Not found | | | none | Unverified defaults 5-10 % |

### 2.8 Market

| Finding | Value | Date | Where | Source | Note |
|---|---|---|---|---|---|
| Malaysian mushroom market | USD 320.2 million (2025), growing 5.33 % a year to 2034 | 2026 | MY | S45 | No lion's mane split |
| Lion's mane demand size | Not found | | MY | none | Open question |
| Channel: supermarket | Fresh lion's mane packs at 3 Jaya Grocer outlets, plus GrabMart | 2026 | MY (KL) | S24 | |
| Channel: restaurants, cafes, hotels | Shroomy (min 1 kg, 4-week lead time), Mogoo Farm | 2026 | MY | S24, S25 | |
| Channel: supplement makers | Mr Fungus supplies certified supplement brands | 2026 | MY | S23 | |
| Channel: extract powder | Mogoo Farm sells extract (third-party GMP plant); Malaysian powder exported at USD 255/kg | 2025-26 | MY | S25, S31 | |
| Channel: online retail | Dusun, Vegan District | 2026 | MY | S26, S28 | |
| Channel: direct, community | RM70/kg, RM10 packs; online marketing is a challenge | 2025 | MY (Perak) | S18 | |
| Dried product | Retail dried lion's mane is mostly imported from China (about RM149/kg) | undated | MY | S29 | At a 5:1 to 10:1 fresh-to-dry ratio, drying earns only RM15-30 per fresh kg: sell fresh |
| Local competitors | Mr Fungus (KL), Shroomy (KL), Mogoo (Klang), 7-Stars (Semenyih), Pasir Salak project | 2025-26 | MY | S23, S24, S25, S46, S18 | Mr Fungus, Shroomy and 7-Stars state climate control or cold rooms; Pasir Salak uses a 24-28 C smart house |

## 3. Worked example

### 3.1 Inputs used

| Input | Grey oyster, shed | Grey oyster, controlled | Lion's mane, controlled | Source of default |
|---|---|---|---|---|
| Blocks in the room | 2000 | 2000 | 2000 | App default room |
| Block life (days) | 90 | 60 | 42 | Section 1 |
| Blocks started per month | 667 | 1000 | 1429 | 2000 x 30 / block life |
| Block price (bought) | RM2.00 | RM2.00 | RM6.00 | Section 1 |
| Yield per good block | 170 g | 238 g (+40 %) | 250 g | Section 1 |
| Blocks lost | 10 % | 5 % | 10 % | Section 1 |
| Shrink to sale | 5 % | 5 % | 10 % | Section 1 |
| Sold per block started | 145 g | 215 g | 203 g | Derived |
| Price | RM10/kg | RM10/kg | RM50/kg | Section 1 |
| Packing and delivery | RM0.50/kg | RM0.50/kg | RM3.00/kg | Section 1 |
| Climate electricity per block | RM0 | RM0.25 (0.46 kWh) | RM0.53 (0.96 kWh) | App, at RM0.55/kWh |
| Labour | 0.75 h per 1000 blocks per day | 0.75 | 1.0 | Section 1, unverified |
| Labour cost | RM10/h | RM10/h | RM10/h | Section 1 |
| Room: 5 x 4 x 3 m, walls + ceiling | none | 74 m2 x RM220 (50 mm) = RM16,280 | 74 m2 x RM250 (75 mm) = RM18,500 | Section 1 |
| AC | none | 1 x 1.5 hp inverter + fitting = RM2,060 | 1 x 2.5 hp inverter + fitting = RM4,290 | Assumed; use the C8 equipment check |
| Fogger, fan pair, controller, racks, wiring | Shed RM5,000 all-in | RM1,500 + 800 + 1,500 + 3,000 + 1,000 = RM7,800 | RM7,800 | Section 1, mostly unverified |
| Total equipment | RM5,000 | RM26,140 | RM30,590 | Sum |
| Write-off | 60 months | 60 months | 60 months | Assumption, no interest |

### 3.2 Per block started

| Line (RM per block) | Grey oyster, shed | Grey oyster, controlled | Lion's mane, controlled |
|---|---|---|---|
| Sales | 1.45 | 2.15 | 10.12 |
| Block | -2.00 | -2.00 | -6.00 |
| Labour | -0.68 | -0.45 | -0.42 |
| Climate electricity | 0.00 | -0.25 | -0.53 |
| Packing and delivery | -0.07 | -0.11 | -0.61 |
| Operating profit | -1.29 | -0.66 | 2.57 |
| Equipment write-off | -0.12 | -0.44 | -0.36 |
| Profit | -1.42 | -1.10 | 2.21 |
| Full cost per kg sold | RM19.76 | RM15.10 | RM39.08 |
| Break-even price | RM19.76/kg | RM15.10/kg | RM39.08/kg |

### 3.3 Per 2000-block room per month

| Line (RM per month) | Grey oyster, shed | Grey oyster, controlled | Lion's mane, controlled |
|---|---|---|---|
| kg sold | 97 | 215 | 289 |
| Sales | 969 | 2,148 | 14,464 |
| Operating profit | -863 | -659 | 3,668 |
| Equipment write-off | -83 | -436 | -510 |
| Profit | -946 | -1,095 | 3,158 |
| Equipment cost | 5,000 | 26,140 | 30,590 |
| Payback | never | never (vs shed: 104 months on the extra RM21,140) | 8.3 months |

### 3.4 Does the owner's belief hold?

| Test | Result | Meaning |
|---|---|---|
| Extra sales per block from the controlled room | +RM0.69 | 70 g more sold at RM10/kg |
| Climate cost per block (electricity + equipment write-off) | -RM0.69 | RM0.25 + RM0.44 |
| Net, yield gain against climate cost | about RM0 | The yield gain only just pays the climate cost |
| Other differences per block | +RM0.32 in total | Less labour per block from the 60-day block life (+0.23), no shed write-off (+0.12), more packing (-0.04) |
| Payback of the extra RM21,140, bought blocks | 104 months | Longer than the 60-month equipment life |
| Payback of the extra RM21,140, own blocks at RM1.00 | 39 months | Pays back within the equipment life, with little room for error |
| Yield gain needed for equal profit per block | +18 % | |
| Yield gain needed for a 5-year payback | +51 % (bought blocks), +28 % (own blocks) | +40 % assumed; S17 measured +49 % (not MY) |
| Grey oyster at RM10/kg with bought blocks | Loses money in both houses | The block (RM2.00) costs more than its 145 g of mushrooms sell for (RM1.45) |
| Verdict | Mostly holds | At wholesale prices the climate room does not pay back on grey oyster. It does only if the farm makes its own blocks and the gain is 30 % or more |
| Lion's mane at the same defaults | RM2.21 profit per block, RM3,158 per month | Pays the whole room in about 8 months, but only above RM39/kg |

### 3.5 Sensitivity (one input changed at a time)

| Case | Changed input | Profit per block | Profit per month | Break-even price |
|---|---|---|---|---|
| Grey oyster, shed | Own blocks RM1.00 | -0.42 | -279 | RM12.88/kg |
| Grey oyster, controlled | Own blocks RM1.00 | -0.10 | -95 | RM10.44/kg |
| Grey oyster, shed | Retail price RM15/kg | -0.69 | -462 | RM19.76/kg |
| Grey oyster, controlled | Retail price RM15/kg | -0.02 | -21 | RM15.10/kg |
| Grey oyster, controlled | Gain +20 % | -1.39 | -1,387 | RM17.53/kg |
| Grey oyster, controlled | Gain +100 % | -0.22 | -221 | RM10.72/kg |
| Grey oyster, controlled | Block life 90 days, as in the shed | -1.54 | -1,025 | RM17.16/kg |
| Grey oyster, shed | Hot month, yield -50 % | -2.11 | -1,406 | RM39.03/kg |
| Lion's mane | Price RM30/kg | -1.84 | -2,628 | RM39.08/kg |
| Lion's mane | Price RM70/kg | 6.26 | 8,944 | RM39.08/kg |
| Lion's mane | Yield 150 g | -1.60 | -2,281 | RM63.14/kg |
| Lion's mane | Yield 400 g | 7.92 | 11,316 | RM25.55/kg |
| Lion's mane | Block RM3.00 | 5.21 | 7,444 | RM24.27/kg |
| Lion's mane | Block RM10.00 | -1.79 | -2,556 | RM58.84/kg |
| Lion's mane | Own block RM2.50 | 5.71 | 8,158 | RM21.80/kg |
| Lion's mane | Electricity RM0.68/block | 2.06 | 2,944 | RM39.82/kg |
| Lion's mane | Yield 150 g and price RM30/kg | -4.03 | -5,752 | RM63.14/kg |

### 3.6 What the example says

| Point | Detail |
|---|---|
| Lion's mane depends on three unknowns | Selling price, yield per block and block price. Each one alone can turn RM3,000 a month into a loss |
| Lion's mane break-even is near import prices | Break-even RM39/kg; Chinese and Taiwanese export prices are RM25-36/kg before freight. Selling fresh to restaurants and shops at RM50-70/kg is the safer plan |
| Electricity is small for lion's mane | RM0.53 of RM7.92 cost per block (7 %). A bigger AC or thicker panels matter less than block price and yield |
| Grey oyster margins are thin everywhere | Bought blocks at RM2 lose money at RM10/kg wholesale. Malaysian oyster farms survive on own blocks, family labour and retail sales |
| The calculator needs these levers | Bought vs own blocks; wholesale vs retail price; yield gain; block life; electricity per block from the simulation; equipment list from the C8 check |

## 4. Open questions for the owner

| # | Question | Why it matters | Default used until answered |
|---|---|---|---|
| 1 | What yield per block and block price do you get now in grey oyster sheds (yours or growers you know)? | Calibrates the shed baseline, which decides the grey oyster verdict | 170 g, RM2.00 |
| 2 | Will you buy lion's mane blocks or make them? From whom, what size, what landed price, which strain? | Block price swings lion's mane from a RM2,600 loss to a RM8,000 profit a month | Bought, RM6.00, 1 kg |
| 3 | Who will buy the lion's mane, and at what price: restaurants, Jaya Grocer-type shops, supplement or extract makers, direct? | Price is the largest lever; break-even is RM39/kg | RM50/kg |
| 4 | Do you know Cameron Highlands lion's mane prices (farm-gate and in KL)? | They are the main local competitor; no price was found online | none |
| 5 | Is the farm eligible for the TNB Specific Agriculture tariff? | About 48.8 vs 55.2 sen/kWh (rates unverified) | RM0.55/kWh |
| 6 | Will workers be paid staff or family? How many hours a day per room? | Labour is a quarter to a third of grey oyster costs | 0.75-1.0 h per 1000 blocks per day at RM10/h |
| 7 | What does a traditional shed cost you per 2000 blocks? | Sets the shed side of the payback | RM5,000, unverified |
| 8 | Room size, panel thickness and AC from the C8 equipment check? | Replaces the assumed 1.5 hp / 2.5 hp and RM220-250/m2 panels | 60 m3, 74 m2 of panel |
| 9 | Over how many years should equipment be written off, and is there a loan? | Changes monthly cost and payback | 5 years, no interest |
| 10 | Will surplus lion's mane be dried or sold to processors? | Dried sells at about RM149/kg retail, worth only RM15-30 per fresh kg | Sell fresh only |
| 11 | Will the farm make its own grey oyster blocks? | Own blocks halve the grey oyster loss | Bought |
| 12 | Packing and delivery cost per kg? | Lion's mane needs cold chain; unverified RM3/kg | RM0.50 (oyster), RM3.00 (lion's mane) |

## 5. How the defaults were set

| Rule | Detail |
|---|---|
| Malaysian first | Malaysian 2023-2026 sources set the default where they exist; older or foreign sources set low/high only |
| Farm data over guides | Grey oyster yield uses farm output (100-150 g) over guide claims (250-640 g), as the yield-counting advice in S49 suggests |
| Energy from the app | Climate electricity comes from the app's crop-cycle simulation, scaled to RM0.55/kWh |
| Losses separate from yield | Yield is per good block; losses and shrink are separate inputs so the calculator can show each |
| Estimates marked | Every default without a source has confidence "low" and an empty or "unverified" source list |

## 6. Not found (search budget ran out)

| Gap | Next step |
|---|---|
| Malaysian price for lion's mane blocks | Ask Mr Fungus, Shroomy, 7-Stars, or importers; search Shopee for "baglog lion's mane" |
| Cameron Highlands lion's mane farm-gate price | Ask Kea Farm market stalls or wholesalers in Selayang |
| FAMA farm-gate prices | FAMA price bulletin or office |
| Primary page for the Specific Agriculture tariff rates | TNB tariff schedule, or call TNB 1300-88-5454 |
| Fan pair, controller and rack prices | Hardware research (C8) or local quotes |
| Traditional shed build cost | Owner, or local growers |
| Labour hours per 1000 blocks | Owner's own records |
| Contamination rate of bought blocks | Owner's records; Malaysian studies on green mould |
| Lion's mane demand in Malaysia | Import data (DOSM trade statistics, HS 0709.59) |

## 7. Sources

| Id | Source | Date | Where | How read | What it says |
|---|---|---|---|---|---|
| S01 | <https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/> | 2026 | MY | search summary | Grey oyster blocks, Parit Hassan (Johor): RM2.80 (1-50), RM2.50 (51-250), RM2.30 (251+) |
| S02 | <https://www.facebook.com/cendawansegaragro/videos/dapatkan-bongkah-cendawan-tiram-kelabu-organikharga-serendah-rm150-per-pcs-pengh/701570107651804/> | undated | MY | search summary | Grey oyster blocks from RM1.50 each, delivered in the Peninsula |
| S03 | <https://siswazah-tani.blogspot.com/2020/11/jualan-bongkah-cendawan-tiram-kelabu.html> | 2020-11 | MY | fetched | Blocks RM3.00-4.00 in packs; RM1.50 delivered for 1000+ |
| S04 | <https://siswazah-tani.blogspot.com/2020/01/cara-mengira-kos-penghasilan-beg.html> | 2020-01 | MY | fetched | Own block direct cost RM0.65 (rounded RM0.70); plus RM0.50 overhead = RM1.20 |
| S05 | <https://siswazah-tani.blogspot.com/2016/12/kos-yang-terlibat-dalam-menghasilkan.html> | 2016-12 | MY | search summary | 7000 bags RM4,366 = RM0.62/bag; bag 600-700 g |
| S06 | <https://epengembangan.doa.gov.my/en/tanaman/komoditi-berpotensi/cendawan/> | undated | MY (DOA) | fetched | 60-80 g per bag per harvest, 6-8 harvests, 60 d incubation, 10 d rest, house 28-30 C 80-90 % RH, cold store 5-8 C 3-4 days |
| S07 | <https://cendawanonline.wordpress.com/> | 2018-07 | MY | fetched | 180 g per block over 3 months (6 harvests); only about 50 % fruit in the first flush; one person can run 1000 blocks |
| S08 | <https://petani.my/cara-tanam-cendawan-tiram-di-rumah/> | undated | MY | search summary | 250-500 g per block over its life (home growing) |
| S09 | <https://www.sciencedirect.com/science/article/pii/S0304423813003129> | 2013 | MY (academic) | search summary | P. pulmonarius on rubber-wood sawdust, 270 g dry substrate: 231 g/bag liquid spawn, 116 g/bag grain spawn |
| S10 | <https://www.researchgate.net/publication/376638044_SCIPe_MARDI_Pakej_lengkap_untuk_industri_cendawan_tempatan_SCIPe_MARDI_A_complete_package_for_the_local_mushroom_industry> | about 2023 | MY (MARDI) | search summary (page 403) | Commercial grey oyster strain 149 g/bag; new strains 102-139 g/bag |
| S11 | <http://etmr.mardi.gov.my/index.php/25-abstract/2013/volume-8/57-daya-maju-perusahaan-cendawan-tiram-di-semenanjung-malaysia> | 2013 | MY (MARDI) | search summary | 149 growers: typical farm 6000 blocks, 20 kg/day; cost RM5.30/kg; farm price RM10/kg |
| S12 | <https://www.utusanborneo.com.my/2025/12/20/pengusaha-tanaman-cendawan-tiram-mampu-meraih-pendapatan-lumayan> | 2025-12-20 | MY (Bintulu) | fetched | 100,000 blocks, 3.4 t/month, RM32,000/month (about RM9.40/kg derived) |
| S13 | <https://www.hmetro.com.my/mutakhir/2025/05/1222854/100000-bongkah-cendawan-tiram-jana-hasil-rm37500-sebulan> | 2025-05-26 | MY (Bintulu) | headline only | Same farm: RM37,500/month, RM1.5 million invested |
| S14 | <https://www.sinarharian.com.my/article/257798/edisi/johor/cuaca-panas-pengeluaran-cendawan-tiram-terjejas> | 2023-05-10 | MY (Johor) | fetched | Heat wave (34 C): 40,000 blocks fell from 20 kg/day to 8 kg/day; sold at about RM12/kg |
| S15 | <https://agrimag.my/en/article-details/pengeluaran-harian-300-kg-bekalan-cendawan-tiram-masih-kurang> | 2023-07-17 | MY (Selangor) | fetched | 180,000-block farm: 300 kg/day peak, 100 kg/day off season; wholesale above RM10/kg; 6 flushes |
| S16 | <https://www.hargasekilo.my/harga-cendawan-tiram/> | 2026-04-10 | MY | fetched | Oyster RM/kg: farm 10-15, farm wholesale 10-13, wet market 12-18, supermarket 15-20 (no method given) |
| S17 | <https://www.sciencedirect.com/science/article/pii/S2666154323004593> | 2023 | not MY (country not checked) | search summary | Controlled room gave about 49 % more oyster yield than a traditional room over three seasons |
| S18 | <https://malaysiaaktif.my/2025/04/cendawan-kobis-bunga-tarik-perhatian-penduduk-seberang-perak> | 2025-04-10 | MY (Perak) | fetched | Lion's mane in a 500-block modular smart house: up to 150 g/block, RM70/kg, 2-cluster pack RM10, harvest in 11-13 days, keeps 1 week in fridge, 2 h outside |
| S19 | <https://pmc.ncbi.nlm.nih.gov/articles/PMC10432537/> | 2023 (trial 2018-19) | TH | fetched | Lion's mane, 750 g wet bottle, 16 C room: 113 g fresh (23 g dry), BE 42.6 %, single harvest at 47 d |
| S20 | <https://finance.sina.com.cn/jjxw/2025-04-12/doc-inesvpzh4569524.shtml> | 2025-04-12 | CN (Changshan) | fetched | Lion's mane bag supplied at 3 CNY/bag cost; about 1 kg mushrooms per bag; guaranteed buy-back 12-16 CNY/kg |
| S21 | <https://www.163.com/dy/article/J4QK1LJP0552KEQO.html> | 2024-06-16 | CN (Qingzhou) | fetched | Fresh lion's mane about 30 CNY per jin (60 CNY/kg); co-op claims 4 flushes, 3 kg per bag (optimistic) |
| S22 | <https://www.nongji1958.com/index.php/node/61629> | 2023 | CN (Shandong factory) | fetched | Factory lion's mane: 3 flushes, 0.8 jin (400 g) per bag, over 50 days |
| S23 | <https://www.mrfungus.com.my/> | 2026 | MY (KL) | fetched | Climate-controlled lion's mane; says most farms import ready-to-fruit bags; harvest about 10 d after entering grow tents; sells to chefs and supplement brands |
| S24 | <https://www.shroomy-tek.com/wholesale> | 2026 | MY (KL) | fetched | Climate-controlled KL farm; lion's mane packs at 3 Jaya Grocer outlets; restaurants and cafes; min order 1 kg; prices on request |
| S25 | <https://mogoofarm.com/> | 2026 | MY (Klang) | fetched | Lion's mane-only farm; extract powder; wholesale to restaurants and hotels (no prices on page now); RM35 per 300 g per earlier sweep |
| S26 | <https://dusun.com.my/product/organic-local-fresh-lion-mane-200gm/> | 2026 | MY | fetched | Organic local fresh lion's mane RM90 (pack size unclear, 1 kg in title) |
| S27 | <https://dusun.com.my/product/frozen-lions-mane-mushroom-800gm/> | 2026 | MY | earlier sweep | Frozen lion's mane RM25/400 g, RM55/800 g |
| S28 | <https://vegandistrict.my/products/lions-head-mushroom-100g> | 2026 | MY | earlier sweep | Fresh lion's mane RM10 per 100 g (out of stock) |
| S29 | <http://m.organictrend.com.my/index.php?ws=showproducts&products_id=1781209> | undated | MY (import from CN) | search summary (fetch failed) | Dried monkey head mushroom, China, 80 g RM11.90 (about RM149/kg) |
| S30 | <https://www.tridge.com/market-overview/fresh-lion-s-mane-mushroom> | 2026-03 | TW, CN | fetched | Taiwan export about USD 5.7/kg (2026-01..03); China transaction USD 8.10/kg (2025-11) |
| S31 | <https://www.tridge.com/market-overview/powdered-lion-s-mane-mushroom/MY> | 2025-10 | MY export | earlier sweep | Lion's mane powder export sample USD 254.94/kg |
| S32 | <https://www.alibaba.com/supplier/lions-mane-supplier.html> | undated | CN | search summary | Lion's mane 'bags' USD 2.20-2.90, MOQ 500; product type not confirmed |
| S33 | <https://arusenerg.com/tnb-tariff-malaysia/> | 2026 | MY | fetched | LV General (non-domestic): energy 27.03 + capacity 8.83 + network 14.82 = 50.68 sen/kWh; RM20/month retail; RP4 fixed to 2027-12-31 |
| S34 | <https://paultan.org/2026/10/01/tnb-bill-afa-rate-october-2026-set-at-3-61-sen-kwh/> | 2026-10-01 | MY | fetched | AFA +3.61 sen/kWh Oct 2026; forecast +4.27 Nov, +4.46 Dec, +7.59 Jan 2027 |
| S35 | <https://www.mytnb.com.my/ms-MY/business/understand-your-bill/pricing-tariff> | 2026 | MY (TNB) | fetched (no rates on page) | Specific Agriculture LV General tariff exists (replaces Tariff H); rates not on page. 27.03 + 6.19 + 11.19 = 44.41 sen/kWh came from a search summary only |
| S36 | <https://soyacincau.com/2026/09/17/tnb-bill-electricity-afa-retail-sst-exemption-december-2026/> | 2026-09-17 | MY | search summary | 8 % service tax on electricity is domestic only; KWTBB 1.6 % applies to non-domestic |
| S37 | <https://calculatormalaysia.com/harga/harga-aircond-malaysia/> | 2026 | MY | fetched | Split AC prices by hp, inverter and non-inverter; install RM250 (1 hp) to RM350 (2.5 hp) |
| S38 | <https://www.daikin.com.my/product/ftkf-series-r32/> | 2026 | MY | earlier sweep | Daikin FTKF 2.5 hp RM3,940; 3.0 hp RM4,560 |
| S39 | <https://www.hy-refrigeration.com/latestnews/nid/193501/> | 2026-07-22 | MY (vendor blog) | fetched | Cold room installed: 3x3 m RM18,000-35,000; 5x4 m RM30,000-55,000 (incl. refrigeration) |
| S40 | <https://jialiang.en.alibaba.com/productgrouplist-802767317/Pu_Sandwich_Panel_For_Cold_Room.html> | undated | CN (FOB) | search summary | PU cold-room panel 50 mm USD 13-17/m2; 100 mm cam-lock USD 19-22/m2; MOQ 100 m2 |
| S41 | <https://wiselinkpanel.en.made-in-china.com/product/WELRSYpOvarH/China-50mm-75mm-100mm-200mm-PU-EPS-Rockwool-Sandwich-Panel-for-Cold-Room-Slaughterhouse-Vaccinestore-Sea-Food-House.html> | undated | CN (FOB) | search summary | PU panel 50-200 mm USD 17.50-22.00/m2 by quantity |
| S42 | <https://duokai.en.made-in-china.com/product/ZdoteFAVELrT/China-CE-Approved-24-Liter-Per-Hour-Ultrasonic-Air-Humidifier-Industrial-Agriculture-Grow-Room-Mushroom-Fogger.html> | 2026 | CN (FOB) | fetched | Ultrasonic humidifier 24 L/h USD 880-920; 3 L/h models USD 210-230; 6 L/h USD 290-340 |
| S43 | <https://www.thestar.com.my/news/nation/2025/07/22/rm1700-minimum-wage-to-come-into-force-from-aug-1> | 2025-07-22 | MY | search summary | RM1,700/month minimum wage for all employers from 2025-08-01; hourly RM8.72 |
| S44 | <https://pubmed.ncbi.nlm.nih.gov/39384289/> | 2024 | MY (academic) | search summary (fetch blocked) | Green mould (Trichoderma) on P. pulmonarius in Malaysia; water, air and tools are sources; losses up to 100 % of a batch |
| S45 | <https://www.imarcgroup.com/malaysia-mushroom-market> | 2026 | MY | fetched | Malaysia mushroom market USD 320.2 million (2025), CAGR 5.33 % to 2034; no lion's mane split |
| S46 | <https://mycology.mnsselangorbranch.org/2025/02/7-stars-mushroom-farm-engaging-and.html> | 2025-02 | MY (Semenyih) | fetched | 7-Stars grows lion's mane in cold rooms; no numbers |
| S47 | <https://www.sinarharian.com.my/article/159472/edisi/cendawan-tiram-beri-pendapatan-lumayan-buat-suami-isteri> | 2021-09-04 | MY | fetched | Block lasts 3-4 months; blocks sold RM1.60; mushrooms RM10/kg |
| S48 | <https://www.meritmushrooms.co.uk/product-page/lion-s-mane-mushroom-ready-to-fruit-block> | 2026 | UK | search summary | 3.3 kg ready-to-fruit lion's mane block gives about 1.1 kg over 3 harvests |
| S49 | <https://coollat.com/cara-mengira-hasil-per-bongkah-dengan-betul/> | undated | MY | search summary | Count yield over all blocks put in, not only the healthy ones; seller yield claims are often inflated |
| APP | cycle.js, controller.js, sim.js (this repo) | 2026-10-09 | app | read | Energy per block from the crop-cycle simulation (lead's figures): grey oyster RM0.26, lion's mane RM0.40-0.70 per block at RM0.57/kWh; oyster program 4 flushes, 58 d ready-to-fruit; default room 60 m3, 2000 blocks, 3.5 kW AC, 3 L/h fogger, 1800 m3/h air pair |
| R08 | docs/research/2026-10-08-lionsmane-equipment-raw-findings.json | 2026-10-08 | mixed | repo | Earlier sweep: lion's mane 2-3 flushes, 7-14 d rest, AC and tariff findings |

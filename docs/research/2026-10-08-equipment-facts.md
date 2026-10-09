# Malaysian equipment facts for C8

Note (2026-10-09): the single fresh-air fan model in this file was replaced by the air exchange pair of C9 (`docs/contracts/air.md`); section 15's fan sizes are context, C8 uses `AIR_SIZES`.

## 1. Scope and method

| Item | Value |
|---|---|
| Input | `docs/research/2026-10-08-lionsmane-equipment-raw-findings.json`, sweeps `aircond` (74) and `building` (50) |
| Compared with | `sim.js` `PLANT` and `DEFAULT_ENV`, `controller.js` `MACHINES`, `capacity.js` `DESIGN_DAYS` and `PASS`, `calib.js` `PARAMS`, the tariff `0.57` RM/kWh in `capacity.js`, `cycle.js`, `web/simulator.js` |
| Conversions | 1 kW = 3 412.1 BTU/h ([E3]); 1 HP badge ≈ 9 000 BTU/h ([E2]); 1 CFM = 1.699 m³/h |
| Derived values | Marked "derived" with the arithmetic; they are not from a source |
| Room for UA and load | 5 × 4 × 3 m = 60 m³ (the same as `PLANT.room.volume`); walls 2 × (5 + 4) × 3 = 54 m², roof 20 m², floor 20 m² |
| Psychrometrics | Magnus formula, 101.325 kPa; enthalpy h = 1.006 T + W (2501 + 1.86 T) kJ/kg |

## 2. Sources

| ID | Source | Type | URL |
|---|---|---|---|
| E1 | Senheng, how many HP | retailer blog | [E1] |
| E2 | Aircond Lounge, BTU, ton, HP, kW | HVAC retailer reference | [E2] |
| E3 | Seagull Aire, HP calculator | HVAC retailer reference | [E3] |
| E4 | Acson buying guide | manufacturer | [E4] |
| E5 | Daikin Malaysia FTKF series (R32 inverter split) | manufacturer spec and official price | [E5] |
| E6 | Daikin Malaysia FHC-A series (ceiling exposed, non-inverter) | manufacturer spec | [E6] |
| E7 | recommend.my, MEPS energy labels (cites Suruhanjaya Tenaga) | retailer blog | [E7] |
| E8 | myaccool, star rating and power | retailer blog | [E8] |
| E9 | Samsung remote control support page | manufacturer | [E9] |
| E10 | Midea remote controller manual (PDF via Lowe's) | manufacturer | [E10] |
| E11 | Panasonic remote controller manual (the raw findings hold a shortened path; link is the site root) | manufacturer | [E11] |
| E12 | Panasonic "low temp" solution | manufacturer note, no URL recorded | none |
| E13 | calculatormalaysia, harga aircond | price comparison blog | [E13] |
| E14 | Daikin ceiling cassette and ducted listings (DoubleK, Seng Huat, Seagull Aire, 1Now) | retailer listings via search, no single URL | none |
| E15 | trexon.my, TNB tariff 2026 | energy consultancy | [E15] |
| E16 | arusenerg, TNB tariff | energy consultancy | [E16] |
| E17 | plusxnergy, July 2025 tariff update | energy company blog | [E17] |
| E18 | paultan.org, AFA January 2026 | news | [E18] |
| B1 | EngineeringToolbox, heat loss transmission | engineering table | [B1] |
| B2 | Green Building Index RSI booklet (Malaysia) | guidebook | [B2] |
| B3 | diydata U-values | building reference table | [B3] |
| B4 | ewipro, substrates and U-values | insulation maker blog | [B4] |
| B5 | IJCRT paper citing NBC 2016 (India) | academic paper | [B5] |
| B6 | UK government BRE report on solid walls | government research | [B6] |
| B7 | Kingspan KS1000RW PIR panel datasheet | manufacturer datasheet | [B7] |
| B8 | made-in-china PU panel listing | marketplace, self-reported | [B8] |
| B9 | made-in-china PU panel listing (search snippet) | marketplace, self-reported | [B9] |
| B10 | Aluminium Extrusions AU, EPS panel (NCC tested at 23 °C) | manufacturer | [B10] |
| B11 | Sunnyda, precast sandwich panel | manufacturer | [B11] |
| B12 | JKR guide reproducing MS 1525:2007 | Malaysian government guide | [B12] |
| B13 | MS 1525:2019 preview (cover and foreword only; full tokenised link in the raw findings) | Malaysian Standard | [B13] |
| B14 | ResearchGate figure, Kuala Lumpur annual dry and wet bulb | academic figure (search snippet) | [B14] |
| B15 | MATEC 2016, outdoor comfort Kuala Lumpur | conference paper | [B15] |
| B16 | Greenheck ERV FAQ | manufacturer | [B16] |
| B17 | Renewable Energy Hub, heat recovery efficiencies | search snippet (403) | [B17] |
| B18 | IBSE HK lecture notes SPD5132 | search snippet | [B18] |
| B19 | eng-tips thread, pre-treatment of fresh air | forum (search snippet) | [B19] |
| B20 | Industrial Monitor Direct, pre-cool fresh air in tropical HVAC | search snippet (403) | [B20] |
| B21 | Rootlab 14 kg/h ultrasonic humidifier | retailer | [B21] |
| B22 | Duokai 24 L/h ultrasonic humidifier | marketplace, self-reported | [B22] |
| B23 | growmushrooms.eu 3 L/h humidifier | retailer | [B23] |
| B24 | fasalbazar centrifugal humidifier (title and body disagree) | retailer | [B24] |
| B25 | Shroom Supply 12-disc fogger | retailer | [B25] |
| B26 | Mycelium Nest humidifier guide | gear guide | [B26] |
| B27 | Hull Hydroponics, VIVOSUN S6 inline fan | retailer | [B27] |
| B28 | VIVOSUN AeroZesh S4 | manufacturer | [B28] |
| B29 | Fresh Fungi Farm exhaust fan guide | gear guide | [B29] |
| B30 | veshenka-expert, mushroom ventilation | oyster ventilation guide | [B30] |

## 3. Air conditioner sizes

| HP badge | BTU/h, median of sources | BTU/h range | kW cooling (derived: BTU/h ÷ 3 412.1) | kW from sources | Daikin model, rated BTU/h (min–max) | Daikin rated input W | Rated COP (derived: kW ÷ input) | CSPF | Sources |
|---|---|---|---|---|---|---|---|---|---|
| 1.0 | 9 000 | 8 500–9 700 | 2.64 | 2.49–2.78 | FTKF25: 9 000 (3 400–9 200) | 860 (200–960) | 3.07 | 4.60 (4 star) | [E1] [E2] [E3] [E4] [E5] |
| 1.5 | 12 150 | 11 500–13 000 | 3.56 | 3.37–3.81 | FTKF35: 12 300 (4 100–13 000) | 1 175 (200–1 285) | 3.07 | 4.60 | [E1] [E2] [E3] [E4] [E5] |
| 2.0 | 18 000 | 17 500–19 000 | 5.28 | 5.12–5.42 | FTKF50: 18 000 (5 200–18 500) | 1 880 (380–1 950) | 2.81 | 5.02 | [E1] [E2] [E4] [E5] |
| 2.5 | 23 250 | 20 500–25 000 | 6.81 | 6.00–7.32 | FTKF71: 24 000 (6 600–24 500) | 1 965 | 3.58 | 6.00 (5 star) | [E1] [E2] [E3] [E4] [E5] |
| 3.0 | 27 000 | 24 000–30 000 | 7.91 | 7.03–8.79 | FTKF75: 25 600 (7 900–29 000) | 2 180 | 3.44 | no source | [E2] [E4] [E5] |
| about 2.0, non-inverter ceiling | 18 500 | n/a | 5.42 | n/a | FHC50AV1M9 | 1 785 | 3.04 | 3.23 | [E6] |
| about 4.0, non-inverter ceiling | 36 000 | n/a | 10.55 | n/a | FHC100AV1M9 | 3 250 | 3.25 | 3.45 | [E6] |
| about 5.0, non-inverter ceiling | 46 000 | n/a | 13.48 | n/a | FHC140AV1M | 4 300 | 3.14 | 3.33 | [E6] |
| about 6.0, non-inverter ceiling | 55 000 | n/a | 16.12 | n/a | FHC160AV1M | 5 500 | 2.93 | 3.11 | [E6] |

## 4. Efficiency rules and power draw

| Item | Value | Source |
|---|---|---|
| MEPS 2 star minimum, below 4.5 kW | CSPF 4.1 Wh/Wh | [E7] |
| MEPS 2 star minimum, 4.5–7.1 kW | CSPF 4.0 Wh/Wh | [E7] |
| Energy label coverage | up to 7.1 kW (1.0–2.5 HP) | [E7] |
| MEPS 2 star minimum from 2030 | CSPF 6.09 Wh/Wh (5 star 7.5) | [E7] |
| 1.5 HP draw by star rating | 3 star about 1 400 W, 4 star about 1 050 W, 5 star about 850 W | [E8] |
| Plain COP for non-inverter units | no source (only CSPF and rated input) | none |
| COP at a room colder than the rating point | no source | none |

## 5. Lowest setpoint

| Item | Value | Source |
|---|---|---|
| Samsung split | 16–30 °C, 1 °C steps; "may vary by country" | [E9] |
| Midea split | 16–30 °C | [E10] |
| Panasonic split | 16–30 °C | [E11] |
| Panasonic "low temp" ducted, cassette, under ceiling or high wall | down to 8 °C, 100 % sensible cooling | [E12] (no URL recorded) |
| `controller.js` `MACHINES` | `acSetMin 16`, `acSetMax 30` | matches the three manuals |
| `sim.js` step | setpoint clamped to 16–30 | matches |

## 6. Air conditioner prices (Malaysia, October 2026, promotional)

| Size | Non-inverter RM | Inverter RM | Installation RM | Source |
|---|---|---|---|---|
| 1.0 HP | 869 (Midea) | 1 098–1 490 (Midea, Sharp, Daikin) | 250 | [E13] |
| 1.5 HP | 1 153–1 549 (Midea, Panasonic, Sharp) | 1 317–1 929 (Midea, Daikin, Sharp, Panasonic) | no source | [E13] |
| 2.0 HP | 1 955 (Midea) | 2 999–3 079 (Daikin, Panasonic) | 310 | [E13] |
| 2.5 HP | no source | 3 940 (Daikin FTKF71, official) | no source | [E5] |
| 3.0 HP | no source | 4 560 (Daikin FTKF75, official) | no source | [E5] |
| 4.0 HP ceiling cassette | no source | 8 510 (Daikin FCFG100A) | no source | [E14] |
| 5.0 HP ceiling cassette | no source | 5 999–9 780 (Daikin FCC140A, FCFG140A) | no source | [E14] |
| 4.0–6.0 HP ducted | no source | 6 790–8 410 (Daikin FDMFC100A, FBA125B, FDMFC140A) | no source | [E14] |
| Low-temp (8 °C) unit | no source | no source | no source | none |

## 7. Air conditioner against `PLANT.ac`

| `PLANT.ac` value | Sim | Sources | Comment |
|---|---|---|---|
| `capW` | 3 500 W | 1.5 HP: 3.37–3.81 kW; Daikin FTKF35 3.60 kW | The sim AC is a 1.5 HP split |
| COP (`copCool(To) = 4.4 − 0.05 (To − 20)`, 2–5) | 3.74 at 33.3 °C, 4.2 at 24 °C | Rated COP 2.81–3.58 (derived from [E5], [E6]); CSPF 4.60–6.00 (seasonal, part load) | The sim sits between full-load rated COP and seasonal CSPF; at a 16–20 °C room real COP is lower than rated (no source for how much) |
| `minFrac` | 0.2 | Daikin minimum ÷ rated: 0.28–0.38 (FTKF25 0.38, FTKF35 0.33, FTKF50 0.29, FTKF71 0.28, FTKF75 0.31) | The sim modulates lower than the real inverters; a real unit cycles more at light load |
| Maximum output | 1.0 × `capW` | Daikin maximum ÷ rated: 1.02–1.13 | Close |
| `auxW` 35 W, `standbyW` 3 W | 35, 3 | no source | none |
| Setpoint range | 16–30 | 16–30 ([E9], [E10], [E11]) | Matches |
| Coil temperatures, `latentMax`, `dryMaxFrac` | various | no source | none |

## 8. Cooling load of a lion's mane room (derived)

| Item | Value | Arithmetic |
|---|---|---|
| Outdoor design air | 33.3 °C, 27.2 °C wet bulb: 62.5 % RH, 20.2 g/kg, h = 85.4 kJ/kg | MS 1525 ([B12]), psychrometrics |
| Room, lion's mane fruiting | 20 °C, 90 %: 13.2 g/kg, h = 53.5 kJ/kg | proposed profile |
| Room, oyster fruiting | 25 °C, 88 %: 17.6 g/kg, h = 69.9 kJ/kg | `CROPS.oyster.fruiting` |
| Fresh air | 300 m³/h = 5 air changes per hour (low end of 5–8 for lion's mane) = 0.1 kg/s | 300 ÷ 3 600 × 1.2 |
| Blocks | 2 000 blocks × 45 mL/h CO2 = 1.5 L/min × 318 W per L/min = 477 W | `DEFAULT_ENV`, `PLANT.resp` |
| Base and lights | 30 + 80 = 110 W | `PLANT.loads` |
| Oyster, UA 80 | 80 × 8.3 = 664 W + 0.1 × (85.4 − 69.9) × 1 000 = 1 550 W + 477 + 110 = 2 801 W | fits the 3 500 W sim AC |
| Lion's mane, UA 80 (`PLANT.room.ua`) | 80 × 13.3 = 1 064 W + 0.1 × (85.4 − 53.5) × 1 000 = 3 182 W + 477 + 110 = 4 833 W | needs 2.0 HP (5.28 kW) at least |
| Lion's mane, UA 80, 480 m³/h (8 changes per hour) | 1 064 + 5 091 + 477 + 110 = 6 742 W | needs 2.5 HP (6.81 kW) |
| Lion's mane, PU 50 room (UA 28.1) | 374 + 3 182 + 477 + 110 = 4 142 W | 2.0 HP |
| Lion's mane, brick 115 walls and zinc roof (UA 283.4) | 3 769 + 3 182 + 477 + 110 = 7 538 W | 3.0 HP, before solar gain on the zinc |
| Caveat | Rated capacity is measured with a 27 °C room; at 20 °C it is lower (no source). The capacity check in `capacity.js` is the authority | none |

## 9. TNB tariffs (RP4, from 1 July 2025)

| Tariff | Energy sen/kWh | Capacity sen/kWh | Network sen/kWh | Total before AFA sen/kWh | Total with AFA +3.61 (October 2026), derived | App 0.57 RM/kWh against it | Source |
|---|---|---|---|---|---|---|---|
| Domestic, up to 1 500 kWh per month | 27.03 | 4.55 | 12.85 | 44.43 | 48.04 | 19 % higher | [E15] [E16] |
| Domestic, above 1 500 kWh (on all kWh) | 37.03 | 4.55 | 12.85 | 54.43 | 58.04 | 2 % lower | [E15] [E16] |
| Commercial low voltage general (B) | 27.03 | 8.83 | 14.82 | 50.68 | 54.29 (AFA on commercial not confirmed) | 5 % higher | [E16] [E17] |
| Commercial medium voltage general | 29.83, plus RM89.27 per kW maximum demand, RM200 per month minimum | no source | no source | no source | no source | not comparable | [E15] |
| Commercial high voltage general (C3) | 43.03 | no source | no source | no source | no source | not comparable | [E17] |
| Domestic retail charge | RM10 per month, waived up to 600 kWh | n/a | n/a | n/a | n/a | not in the app | [E16] |
| AFA | +3.61 (October 2026); −4.99 (January 2026) | n/a | n/a | n/a | n/a | not in the app | [E15] [E18] |
| Agriculture tariff, service tax, EEI rebate | no source | n/a | n/a | n/a | n/a | n/a | none |
| Primary TNB booklet | not readable (PDF came as binary) | n/a | n/a | n/a | n/a | n/a | aircond sweep notes |

## 10. U-values

| Construction | U W/m²K, median | U range | Sources (n) | Confidence | Note | Source |
|---|---|---|---|---|---|---|
| Bare zinc or corrugated metal | 8.5 | 6.8–8.5 | 2 | medium | 6.8 is a single metal door; the sheet itself has 0.000 m²K/W ([B2]), the air films decide | [B1] [B2] |
| Brick 115 mm, plastered | 2.1 | 2.0–2.2 | 2 | medium | n/a | [B3] [B4] |
| Brick 230 mm | 2.2 | 1.7–3.15 | 3 | low | UK solid wall 1.7–2.1 (in situ 1.75); India NBC 3.15; diydata gives 2.2 for both thicknesses | [B3] [B5] [B6] |
| PU (PIR) panel 50 mm | 0.38 | 0.38 | 1 | medium | Kingspan datasheet | [B7] |
| PU (PIR) panel 75 mm | 0.275 (derived: between 70 mm 0.30 and 80 mm 0.25) | 0.25–0.30 | 1 | medium | no 75 mm product | [B7] |
| PU (PIR) panel 100 mm | 0.20 | 0.20 | 1 | medium | n/a | [B7] |
| PU panel, thickness not stated | 0.45 | n/a | 1 | low | marketplace; foam λ 0.024–0.03 W/mK | [B8] [B9] |
| EPS panel 50 mm | 0.715 | 0.57–0.86 | 2 | low | two makers differ by up to 2× | [B10] [B11] |
| EPS panel 75 mm | 0.475 | 0.38–0.57 | 2 | low | n/a | [B10] [B11] |
| EPS panel 100 mm | 0.305 | 0.19–0.42 | 2 | low | n/a | [B10] [B11] |
| Floor slab | no source | n/a | 0 | none | Floor left out of UA below | none |

## 11. UA of a 5 × 4 × 3 m room (derived)

| Construction (walls 54 m², roof 20 m²; floor left out) | UA W/K | Arithmetic | UA range W/K | With a panel floor (94 m²) | Conduction at 33.3 °C out, 20 °C in (ΔT 13.3) | Against `PLANT.room.ua` 80 and `calib.js` 20–400 |
|---|---|---|---|---|---|---|
| Zinc walls and zinc roof | 629.0 | 74 × 8.5 | 503–629 | n/a | 8 366 W | Above the calibration maximum 400 |
| Brick 115 walls, zinc roof | 283.4 | 54 × 2.1 + 20 × 8.5 = 113.4 + 170 | 278–289 | n/a | 3 769 W | 3.5 × the sim |
| Brick 115 walls, PU 50 ceiling | 121.0 | 113.4 + 20 × 0.38 = 113.4 + 7.6 | 115.6–126.4 | n/a | 1 609 W | 1.5 × the sim |
| Brick 230 walls, zinc roof | 288.8 | 54 × 2.2 + 170 = 118.8 + 170 | 261.8–340.1 | n/a | 3 841 W | 3.6 × the sim |
| Brick 230 walls, PU 50 ceiling | 126.4 | 118.8 + 7.6 | 99.4–177.7 | n/a | 1 681 W | 1.6 × the sim |
| EPS 50 panel | 52.9 | 74 × 0.715 | 42.2–63.6 | 67.2 | 704 W | Below the sim |
| EPS 75 panel | 35.2 | 74 × 0.475 | 28.1–42.2 | 44.7 | 468 W | Below the sim |
| EPS 100 panel | 22.6 | 74 × 0.305 | 14.1–31.1 | 28.7 | 301 W | Near the calibration minimum 20 |
| PU 50 panel | 28.1 | 74 × 0.38 | 28.1 | 35.7 | 374 W | Below the sim |
| PU 75 panel | 20.4 | 74 × 0.275 | 18.5–22.2 | 25.9 | 271 W | At the calibration minimum 20 |
| PU 100 panel | 14.8 | 74 × 0.20 | 14.8 | 18.8 | 197 W | Below the calibration minimum 20: calibration would clip it |
| Not counted | Door, panel joints, thermal bridges, solar gain on the roof (`PLANT.loads.solarPeakW` 500 W has no source) | n/a | n/a | n/a | n/a | Real UA is higher than these panel figures |

## 12. Malaysian lowland design conditions

| Condition | Dry bulb °C | Wet bulb °C | RH % (derived) | g/kg (derived) | h kJ/kg (derived) | Source |
|---|---|---|---|---|---|---|
| MS 1525:2007 ACMV design (kept in 2014) | 33.3 | 27.2 | 62.5 | 20.2 | 85.4 | [B12] |
| MS 1525:2019 | not readable | "revised" (value behind the SIRIM paywall) | n/a | n/a | n/a | [B13] |
| Kuala Lumpur annual maximum | 34.9 | 26.5 | 51.8 | 18.3 | 82.0 | [B14] |
| Outdoor comfort band, Kuala Lumpur (not a design value) | 27.5–33.7 | n/a | 50.7–85 | n/a | n/a | [B15] |
| Night low, night RH | no source | no source | no source | n/a | n/a | none |

| `DESIGN_DAYS['my-lowland']` day | Low–high °C | RH at 15:00 / 03:00 % | Peak wet bulb °C (derived) | Peak h kJ/kg (derived) | Against MS 1525 |
|---|---|---|---|---|---|
| Hot-dry | 24–34 | 50 / 90 | 25.4 | 77.2 | Dry bulb 0.7 °C above design (near the 34.9 annual maximum); enthalpy 8.2 kJ/kg below |
| Hot-humid | 25–32 | 70 / 95 | 27.4 | 86.2 | Wet bulb and enthalpy match the design (27.2, 85.4); dry bulb 1.3 °C below |
| Mild / rainy | 23–28 | 85 / 98 | 25.9 | 80.1 | Below design |
| `DEFAULT_ENV` daily cycle | 24–33, night RH 95 | n/a | n/a | n/a | 33 °C peak is 0.3 °C below 33.3 |
| Lows 23–25 °C and night RH 90–98 % | no source | n/a | n/a | n/a | Still estimates |

## 13. Pre-cooling and heat recovery

| Device | Effectiveness | Kind | Saving on 300 m³/h fresh air at design (derived: effectiveness × 3 182 W total or 1 338 W sensible) | Source |
|---|---|---|---|---|
| Aluminium plate ERV | 30 % total | sensible only | about 400 W (30 % of the 1 338 W sensible part) | [B16] |
| Hygroscopic core ERV | 50–60 % total | sensible and latent | 1 590–1 910 W | [B16] |
| Desiccant wheel ERV | 70–80 % total | sensible and latent | 2 230–2 550 W | [B16] |
| Run-around coil | 45–65 % | sensible only | 600–870 W | [B17] |
| Plate air-to-air exchanger | 50–75 % | sensible only | 670–1 000 W | [B17] |
| Thermal (energy) wheel | 70–85 % | sensible and latent | 2 230–2 700 W | [B18] |
| Fresh air cooled to 12–13 °C for dehumidification | needs about 7 °C chilled water, 4-row coil | coil | no saving figure | [B20] |
| Pre-cooling coil alone (no heat recovery) | "doesn't improve efficiency significantly if at all" | opinion | none | [B19] |
| Prices of any of these | no source | n/a | n/a | none |
| `PLANT` | No heat recovery or pre-cooling element; fresh air enters at outdoor state | n/a | n/a | sim.js |

## 14. Foggers and humidifiers

| Unit | Output L/h | Power | Area | Source |
|---|---|---|---|---|
| Ultrasonic, mushroom rooms | 3 | no source | 20–50 m² floor | [B23] |
| Centrifugal, mushroom | 5 (body) or 8 (title) | no source | no source | [B24] |
| 12-disc fogger | 6 | no source | 10 × 15 ft tent | [B25] |
| Ultrasonic | 14 | no source | up to 100 m² | [B21] |
| Ultrasonic, industrial | 24 | 2.4 kW (100 W per L/h, derived), 480 m³/h | 350–400 m² at 2.6 m high | [B22] |
| Sizing, 0.43 m³ tent | 0.2–0.25 | n/a | n/a | [B26] |
| Sizing, 0.61 m³ tent | 0.4–0.5 | n/a | n/a | [B26] |
| Sizing, 2 m³ "walk-in" | 0.6 or more | n/a | n/a | [B26] |
| Per floor area for a 20 m² floor (derived) | 1.2–2.8 (24 L/h ÷ 350–400 m² × 20; 14 L/h ÷ 100 m² × 20); 3 L/h unit rated for 20–50 m² | n/a | n/a | [B21] [B22] [B23] |
| `PLANT.fogger` | levels 1, 2, 3 L/h at 70, 135, 200 W (67–70 W per L/h) | n/a | n/a | sim.js |
| Against `PLANT` | The 3 L/h top level matches the 20–50 m² unit and the 1.2–2.8 L/h area scaling; the only power figure (100 W per L/h) is 40–50 % above the sim | n/a | n/a | n/a |

## 15. Fans and fresh air

| Item | Value m³/h | Source |
|---|---|---|
| VIVOSUN AeroZesh S4 inline fan | 353 (208 CFM) | [B28] |
| VIVOSUN AeroZesh S6 inline fan | 688 (405 CFM) | [B27] |
| Fan power | no source | none |
| Rule: 1 CFM per ft² of floor, 20 m² = 215 ft² (derived) | 366 | [B29] |
| Rule: 10–12 air changes per hour, 60 m³ (derived) | 600–720 | [B29] |
| Rule: "200–400 CFM in most setups", 100–400 CFM range | 170–680 | [B29] |
| Rule: per ton of substrate, single zone | 300 per ton | [B30] |
| Rule: per ton of substrate, mixed ages | 180–220 per ton | [B30] |
| Per ton for 2 000 blocks of 2.27 kg (5 lb, FreshCap block; derived 4.54 t) | 817–1 000 mixed, 1 361 single zone | [B30] and lionsmane-research.md S21 |
| Lion's mane fresh air 5–8 changes per hour, 60 m³ (derived) | 300–480 | lionsmane-research.md S1, S12, S17 |
| CO2 balance, 2 000 blocks × 45 mL/h = 0.09 m³/h, outdoor 420 ppm (derived: 0.09 ÷ (limit − 420) × 10⁶) | 155 at 1 000 ppm; 321 at 700 ppm | `DEFAULT_ENV`, `PLANT.room.co2Out` |
| `PLANT.fan` and `MACHINES.fanM3h` | 300, 600, 900 at 60, 90, 120 W | sim.js, controller.js |
| Against `PLANT` | Low (300) covers the CO2 balance and the 5 changes per hour; High (900) covers 10–12 changes per hour and the mixed-age per-ton rule, not the single-zone per-ton rule (1 361) | n/a |

## 16. Gaps

| Gap | Effect |
|---|---|
| AC capacity and COP at a 16–20 °C room | Lion's mane load sizing (section 8) uses rated capacity, so it is optimistic |
| Low-temp (8 °C) unit: no URL, no price | Cannot cost a true cold-shock room |
| Floor U-value | UA leaves out the floor for brick and zinc rooms |
| MS 1525:2019 revised wet bulb | `DESIGN_DAYS` matches the 2007 value only |
| Night lows and night RH | `DESIGN_DAYS` night values stay estimates |
| Fan and fogger power (except one 24 L/h unit) | `PLANT` watts have no source |
| Agriculture tariff, service tax, EEI | Tariff comparison covers RP4 base and AFA only |
| ERV and heat recovery prices | No payback figure |
| Sol-air temperature of a Malaysian roof (C8 `SOL_AIR_K` 26 K is the ASHRAE light-surface value α/hₒ 0.026; bare or dark zinc 0.052, 52 K) | The sun on zinc roofs in C8 may be about half the real figure |
| Market fresh-air fan sizes above 688 m³/h (C8 `FAN_SIZES` 300–1800 is a step list of the sim's fan) | The fan verdict recommends sizes with no market source |

[E1]: https://www.senheng.com.my/blog-how-many-hp-aircond-do-i-need-malaysia/
[E2]: https://aircondlounge.com/btu-ton-hp-kw/
[E3]: https://www.seagullaire.com/horse-power-calculator/
[E4]: https://www.acson.com.my/buying-guide/
[E5]: https://www.daikin.com.my/product/ftkf-series-r32/
[E6]: https://www.daikin.com.my/product/fhc-a-series-r32/
[E7]: https://www.recommend.my/blog/understanding-aircon-energy-labels-in-malaysia-meps-rating-explained/
[E8]: https://myaccool.com/best-energy-saving-aircon-malaysia-star-rating/
[E9]: https://www.samsung.com/latin_en/support/home-appliances/how-do-i-use-the-remote-control-of-my-air-conditioner/
[E10]: https://pdf.lowes.com/productdocuments/72b35ad1-54d4-4dd4-b35a-c34df780123d/44310361.pdf
[E11]: https://iaq.na.panasonic.com/
[E13]: https://calculatormalaysia.com/harga/harga-aircond-malaysia/
[E15]: https://trexon.my/guides/tnb-tariff-2026
[E16]: https://arusenerg.com/tnb-tariff-malaysia/
[E17]: https://www.plusxnergy.com/july-2025-tnb-tariff-update-what-malaysian-businesses-need-to-know/
[E18]: https://paultan.org/2025/12/26/tnb-sts-afa-rate-for-jan-2026-set-at-4-99-sen-kwh/
[B1]: https://www.engineeringtoolbox.com/heat-loss-transmission-d_748.html
[B2]: https://www.greenbuildingindex.org/wp-content/uploads/2020/07/RSI-Booklet-R1-14042020.pdf
[B3]: https://www.diydata.com/information/u_values/u_values.php
[B4]: https://ewipro.com/2023/06/03/substrates-and-their-u-values/
[B5]: https://ijcrt.org/papers/IJPUB1801109.pdf
[B6]: https://assets.publishing.service.gov.uk/media/5c409bd6ed915d389d28176f/WP2_Nature_of_solid_walls_in-situ_v3.2b.pdf
[B7]: https://www.pirsltd.co.uk/wp-content/uploads/2019/07/12578_Kingspan_PIR_Trapezoidal_Roof_KS1000RW_Datasheet-_EN_UK.pdf
[B8]: https://hongxingjinghua.en.made-in-china.com/product/RriYbNvVrshc/China-25mm-50mm-75mm-100mm-150mm-200mm-Metal-Cold-Room-Wall-EPS-PU-Sandwich-Panel-Insulated-PU-PUR-PIR.html
[B9]: https://m.made-in-china.com/product/50mm-75mm-100mm-150mm-200mm-300mm-PU-PIR-PUR-Puf-Polyurethane-Structural-Insulated-Sandwich-Panel-for-Cold-Storage-2077283835.html
[B10]: https://aluminiumextrusions.com.au/products/eps-sandwich-panel
[B11]: https://www.sunnyda-house.com/precast-sandwich-panel/
[B12]: https://idoc.pub/documents/jkr-panduan-teknik-mekanikal-ms15252007-6nge08pyx1lv
[B13]: https://mysol.jsm.gov.my/
[B14]: https://www.researchgate.net/figure/267856841_fig1_Fig-2-Annual-dry-wet-bulb-temperature-Kuala-Lumpur-Malaysia
[B15]: https://www.matec-conferences.org/articles/matecconf/pdf/2016/29/matecconf_ibcc2016_00084.pdf
[B16]: https://www.greenheck.com/resources/faqs/product-faqs/energy-recovery-ventilators-faqs/energy-recovery-ventilators-faqqa6
[B17]: https://www.renewableenergyhub.co.uk/main/heat-recovery-systems-information/heat-recovery-system-efficiencies
[B18]: http://ibse.hk/spd5132/SPD5132_1617-06.pdf
[B19]: https://www.eng-tips.com/threads/pre-treatment-of-fresh-air.265964/
[B20]: https://industrialmonitordirect.com/blogs/knowledgebase/pre-cool-fresh-air-systems-in-tropical-hvac-design
[B21]: https://www.rootlab.com.au/product/ultrasonic-humidifier-14kg/
[B22]: https://duokai.en.made-in-china.com/product/ZdoteFAVELrT/China-CE-Approved-24-Liter-Per-Hour-Ultrasonic-Air-Humidifier-Industrial-Agriculture-Grow-Room-Mushroom-Fogger.html
[B23]: https://growmushrooms.eu/product/industrial-ultrasonic-humidifier-3l-h-ideal-for-mushroom-growing-rooms/
[B24]: https://fasalbazar.com/index.php/product/centrifugal-humidifier-8-lph-for-mushroom/
[B25]: https://shroomsupply.com/grow-room-supplies/disc-foggers/12-disc-fogger-w-power-supply
[B26]: https://myceliumnest.com/best-humidifier-for-mushroom-growing/
[B27]: https://hullhydroponics.co.uk/products/vivosun-s6-inline-fan
[B28]: https://vivosun.com/en/vivosun-aerozesh-6-inch-inline-fan-hvac-blower-for-ventilation-with-e12-controller-p146256299450869387-v146256305088013324
[B29]: https://freshfungifarm.com/gear-guides/best-exhaust-fan-for-mushroom-cultivation/
[B30]: https://veshenka-expert.info/en/mushroom-ventilation-system/

# Malaysian weather data for the design days

Research for the roadmap item "Malaysian weather data (MetMalaysia) for the design days; editable design days".
Date: 2026-10-09. Status: proposal. No app code changed.
Proposed days in the app's shape: [2026-10-09-design-days-by-station.json](2026-10-09-design-days-by-station.json).
"(unverified)" marks a claim I could not check at a primary source.

## 1. Summary

| # | Finding |
|---|---|
| 1 | MetMalaysia has no free hourly history. Its free APIs give forecasts and warnings only. Hourly station data can be bought through myMETdata (RM20 per product; the unit is unclear). |
| 2 | Free hourly station data for all eight requested stations exists in NOAA ISD-Lite. Ten full years (2015-2024) are 99 % complete at every station. |
| 3 | My design values match ASHRAE's published 2021 values for the same stations within 0.9 °C (most within 0.5 °C). |
| 4 | ERA5 reanalysis (Open-Meteo) is mostly too low on hot days: 0.3 to 1.5 °C at six stations, 3.0 °C at Kota Kinabalu (Kota Bharu: 0.4 °C too high). Use station data for design days. |
| 5 | Today's hot-dry day is too dry: 1.2 to 2.8 g/m³ less water than real hot days. Its nights are 1.4 to 3.2 °C too cool. Its 34 °C peak is about right (real: 33.9 to 35.2 °C). |
| 6 | Today's hot-humid day is too mild: 0.9 to 2.0 g/m³ less water than the most humid real days, and nights 0.7 to 3.0 °C too cool. |
| 7 | Today's mild/rainy day is about right. Its 23 °C night matches the coldest 1 % of hours at Ipoh, Senai, Kota Bharu and Kuching. On the west coast it is up to 0.9 °C too cold. Its air carries 0.8 to 1.5 g/m³ more water than the real wet days. |
| 8 | Net effect: today's days overstate the room capacity. In the default room, 2,000 grey oyster gives a capacity of 3,652 blocks today, but 2,393 to 3,407 on station days. Today's days overstate it by 7 to 53 % (Subang: 3,053, so 20 %). The humid day limits it. |
| 9 | Golden oyster depends on the coolest wet night. At about 23 °C or below, a sparse room runs too wet (capacity about 300 blocks). At 23.2 °C or above it passes up to about 1,500 to 2,000 blocks. This knife-edge decides golden capacity in four of the eight regions. |
| 10 | Licence: NOAA says non-U.S. ISD data "cannot be redistributed". The JSON holds averaged, derived profiles. Ask the owner before the repo is published with them (open question 2). |

## 2. What the app uses today

| Item | Value | Where |
|---|---|---|
| Shape of a region | `DESIGN_DAYS[region] = { name, days: [day, day, day] }` | `capacity.js` line 44 |
| Shape of a day | `{ name, T: [24 numbers, °C], RH: [24 numbers, %] }`, hour 0 to 23 | `capacity.js` `makeDay` |
| Time resolution | Hourly. The simulation interpolates linearly between hours (`sim.js` `weather`). | `sim.js` line 142 |
| Humidity | RH is stored. Water content is derived: `ah = RH/100 × ahSat(T)` in g/m³ (Magnus formula). | `sim.js` line 32 |
| Solar | Not part of the day. Every design day gets the same sun: `sin(π(h−7)/12)` from 07:00 to 19:00, times `solarPeakW` (500 W). No cloud or rain cut on design days. | `sim.js` lines 144-150, `capacity.js` line 137 |
| Daily shape | A cosine: low at 03:00, high at 15:00. RH falls linearly as T rises. | `capacity.js` `makeDay` |
| Regions | One: `my-lowland`, "Lowland Peninsular Malaysia (estimates)" | `capacity.js` line 45 |
| Use in step 1 (`balance`) | Every hour of the three days; each day's worst hour is left out | `capacity.js` `balance` |
| Use in step 2 (`trial`) | A warm-up day (day 0), then the three days; each day is scored on its own | `capacity.js` `trial` |
| Use in the cycle (C7) | Day k of the cycle uses `days[k % 3]`; index 0 hot-dry, 1 hot-humid, 2 mild/rainy | `docs/contracts/cycle.md` section 6 |
| Pass rule | Per day: T in band ≥ 95 % of the day, RH ≥ target − 3 for ≥ 90 %, RH > 95 % for ≤ 10 %, CO₂ ≤ limit ≥ 98 % | `capacity.js` `PASS` |

| Today's day | T (03:00 low to 15:00 high) | RH (high at 03:00, low at 15:00) | Mean water content | Mean dew point |
|---|---|---|---|---|
| Hot-dry | 24 to 34 °C | 90 to 50 % | 19.7 g/m³ | 22.6 °C |
| Hot-humid | 25 to 32 °C | 95 to 70 % | 22.9 g/m³ | 25.1 °C |
| Mild / rainy | 23 to 28 °C | 98 to 85 % | 21.7 g/m³ | 24.0 °C |

## 3. Data sources

| Source | Hourly history? | Variables | Coverage | Licence and cost | Offline on the farm LAN | Verdict |
|---|---|---|---|---|---|---|
| MetMalaysia API (api.met.gov.my) | No. Forecasts and warnings only, with a free token. "For other meteorological data, please contact" MetMalaysia. | Forecast text, min/max T | Forecast locations | Free, token. 60 requests/min (new portal) or 1,000/day (older docs) (unverified) | Not needed: design days are fixed numbers | Not usable for design days |
| data.gov.my weather API | No. 7-day forecast and warnings. | Forecast text, min/max T | States and towns | No key. CC BY 4.0 per a third-party project (unverified) | Not needed | Not usable |
| MetMalaysia myMETdata (purchase) | Yes: "Hourly Dry Bulb Temperature" and "Hourly Relative Humidity" | T, RH, rain, wind, sun, cloud, pressure | MetMalaysia stations | RM20 per product; the unit (per station, per year?) is not stated. 3 to 5 working days. Redistribution terms not stated. | Yes, once bought (CSV) | Best official source for the farm's own station. Confirm unit price and licence first. |
| NOAA ISD / ISD-Lite | Yes | T, dew point, pressure, wind, cloud, rain | All 8 stations; 2015-2024 complete (this study) | Free, no sign-up. Non-U.S. data under WMO Resolution 40: "cannot be redistributed to other users or customers". | Yes, files download once | Used here. Licence question for publishing. |
| ASHRAE climatic design conditions 2021 | No (results only) | 0.4/1/2 % DB with MCWB, WB, DP with HR | 14 Malaysian stations, incl. all 8 | Values free to view on ashrae-meteo.info; the Handbook is paid | Yes (a few numbers) | Cross-check only: no hourly profiles |
| Open-Meteo historical API (ERA5, ERA5-Land, IFS) | Yes | T, RH, dew point, solar | Any point; ERA5 0.25° from 1940, ERA5-Land 0.1° from 1950 | Data CC BY 4.0, but the free API is "for non-commercial purposes" only; 10,000 calls/day | Yes, download once | Cross-check and solar only. A farm app is commercial use. |
| ERA5 direct from Copernicus CDS | Yes | Same as above | Global, 0.25° | CC BY 4.0 since 2 July 2025; commercial use allowed | Yes, download once | Licence-clean fallback, but peaks about 1 °C low (section 6.5) |
| NASA POWER hourly | Yes, from 2001 | T2M, RH2M, solar | Global grid, 0.5° × 0.625° for weather (MERRA-2) | Free; "no restrictions", cite NASA POWER | Yes, download once | Coarser than ERA5; not tested |
| Meteostat | Yes | T, dew point, RH, rain, wind | Stations; gaps filled with model data by default | Data CC BY 4.0 now, but Meteostat says the licence covers only what it redistributes; its upstream for Malaysia is likely NOAA/DWD (unverified) | Yes, bulk files | Same upstream question as ISD |

## 4. Recommendation

| Decision | Choice | Reason |
|---|---|---|
| Data for the design days | Station observations, not reanalysis | ERA5 is up to 1.5 °C low on hot days, 3.0 °C at Kota Kinabalu (section 6.5). The design day is about peaks. |
| Source now | NOAA ISD-Lite, 2015-2024 | Free, hourly, complete, the same raw data ASHRAE uses. Results agree with ASHRAE 2021. |
| Source for the farm, once its location is known | Buy hourly T and RH for the nearest MetMalaysia station (myMETdata), or keep ISD if the licence question is settled | Official data. A clear licence for a commercial farm. Cost is small (RM20 per product; unit unverified). |
| Licence-clean fallback | ERA5 from Copernicus CDS (CC BY 4.0), with peaks raised to the published ASHRAE 0.4 % value | Free for commercial use; ASHRAE numbers fix its peak bias |
| Severity | Hot: 0.4 % peak. Humid: wettest 1 % of days. Wet: wettest 2 % of days at the 1 % cold temperature. | The usual HVAC levels (ASHRAE 0.4 % cooling and dehumidification), applied to whole days |
| Third slot | Keep a wet stress day ("Wet"), not a typical day | With a typical day in slot 3, golden oyster passes everywhere; the wet day is what finds rooms that run too wet (section 7.3) |
| Offline | Design days stay fixed numbers in the app (or the farm database). No weather service is called at run time. | The farm LAN device needs no internet |

## 5. Method

### 5.1 ASHRAE design conditions (the practice this follows)

| Condition | Definition | Use |
|---|---|---|
| Cooling DB 0.4 / 1 / 2 % with MCWB | Dry bulb exceeded by 0.4, 1 or 2 % of the hours of a year (35, 88, 175 h), with the mean wet bulb of the hours at that dry bulb | Sensible cooling: walls, sun |
| Evaporation WB 0.4 / 1 / 2 % with MCDB | Wet bulb exceeded by that share of hours, with the mean coincident dry bulb | Cooling towers; total heat of the fresh air |
| Dehumidification DP 0.4 / 1 / 2 % with HR and MCDB | Dew point exceeded by that share of hours; its humidity ratio (g/kg) at station pressure; the mean coincident dry bulb | Latent load of the fresh air: the case that matters most here |
| Heating DB 99.6 / 99 % | Dry bulb that 99.6 or 99 % of hours are above | Here: the coolest wet night |
| 24-hour profile (ASHRAE) | T(h) = peak − f(h) × daily range, with a fixed fraction table f(h) (2009 Handbook Table 6); the same fractions for wet bulb | The usual way to turn a design point into a design day. Not used here (see 5.2). |

### 5.2 How the proposed days are built

| Step | Rule |
|---|---|
| Data | ISD-Lite hourly T and dew point, 2015-2024, converted from UTC to Malaysia time (UTC+8). Readings outside 15 to 42 °C or with dew point above T are dropped. Missing and dropped hours together: at most 1.3 % per station. |
| Percentiles | METAR readings are whole degrees, so each reading counts as spread over ±0.5 °C and the percentile is interpolated. Wet bulb by the psychrometric equation at station pressure. |
| Hot day | The mean hourly day (mean T, mean vapour pressure, RH from both) of every day whose maximum reached the 0.4 % dry bulb. Raised by 0.3 to 1.0 °C so its peak equals the 0.4 % dry bulb. Water content kept, so RH drops a little. |
| Humid day | The mean hourly day of the 36 days (1 %) with the highest daily-mean humidity ratio. Not shifted. |
| Wet day | The mean hourly day of the 72 days (2 %) with the highest daily-mean RH. Lowered so its minimum equals the 1 % cold dry bulb. RH kept, because rain air stays near saturation as it cools. |
| Typical day | The mean hourly day of all ~3,570 days. Information only. |
| Why composites, not the ASHRAE fraction table | A composite keeps the real daily shape: the low is at 06:00 to 07:00 and the high at 13:00 to 15:00, not 03:00 and 15:00 as in `makeDay`. It also keeps the real link between T and RH through the day. |
| Weakness of composites | Averaging many days smooths the extremes: the mean wet day has a 24 °C night although single wet nights reach 22 to 23 °C. That is why the hot and wet days are shifted to percentile values. |
| App comparison | The app's own `ClimateCapacity.check` on the default room (60 m³, uncalibrated), with each station's days added to `DESIGN_DAYS` in memory only |

## 6. Per-station results

### 6.1 Data coverage (NOAA ISD-Lite, 2015-2024)

| Station | ISD id | Hours used (of 87,672) | Fewest hours in one year | Days with ≥ 22 hours |
|---|---|---|---|---|
| Subang (Kuala Lumpur) | 486470 | 86,716 | 8,396 | 3,566 |
| KLIA (Sepang) | 486500 | 86,751 | 8,396 | 3,571 |
| Ipoh | 486023 | 86,565 | 8,380 | 3,552 |
| Penang (Bayan Lepas) | 486010 | 86,759 | 8,396 | 3,575 |
| Senai (Johor Bahru) | 486790 | 86,678 | 8,402 | 3,566 |
| Kota Bharu | 486150 | 86,714 | 8,393 | 3,570 |
| Kuching | 964130 | 86,798 | 8,398 | 3,572 |
| Kota Kinabalu | 964710 | 86,806 | 8,396 | 3,575 |

### 6.2 Cooling design conditions (°C)

| Station | 0.4 % DB / MCWB / mean coincident RH | 1 % DB / MCWB | 2 % DB / MCWB | 0.4 % WB / MCDB |
|---|---|---|---|---|
| Subang | 35.2 / 26.3 / 51 % | 34.6 / 26.2 | 34.2 / 26.1 | 27.9 / 33.1 |
| KLIA | 34.5 / 26.1 / 53 % | 33.9 / 26.1 | 33.4 / 26.2 | 27.8 / 32.3 |
| Ipoh | 35.1 / 26.2 / 50 % | 34.4 / 26.3 | 34.0 / 26.3 | 28.0 / 33.2 |
| Penang | 34.1 / 26.4 / 56 % | 33.5 / 26.4 | 33.2 / 26.4 | 28.2 / 32.3 |
| Senai | 34.4 / 27.5 / 61 % | 34.0 / 27.4 | 33.4 / 27.3 | 28.6 / 33.5 |
| Kota Bharu | 33.9 / 27.2 / 60 % | 33.3 / 27.1 | 32.9 / 27.1 | 28.2 / 32.3 |
| Kuching | 34.5 / 26.7 / 57 % | 33.9 / 26.7 | 33.4 / 26.7 | 27.9 / 32.2 |
| Kota Kinabalu | 34.4 / 28.4 / 65 % | 34.0 / 28.3 | 33.5 / 28.0 | 29.2 / 33.4 |

### 6.3 Dehumidification design conditions and the cold limit

| Station | 0.4 % DP (°C) / HR (g/kg) / MCDB (°C) | 1 % DP / HR / MCDB | 2 % DP / HR / MCDB | Water at 0.4 % DP (g/m³) | 1 % cold DB (°C) |
|---|---|---|---|---|---|
| Subang | 26.6 / 22.2 / 30.2 | 26.4 / 21.9 / 29.5 | 26.1 / 21.6 / 29.5 | 24.9 | 23.6 |
| KLIA | 26.6 / 22.3 / 30.7 | 26.4 / 21.9 / 29.9 | 26.2 / 21.7 / 29.8 | 24.9 | 23.5 |
| Ipoh | 26.9 / 22.7 / 31.0 | 26.4 / 22.0 / 29.8 | 26.3 / 21.8 / 29.8 | 25.3 | 23.0 |
| Penang | 27.3 / 23.1 / 30.7 | 26.9 / 22.6 / 30.6 | 26.5 / 22.0 / 29.7 | 25.9 | 23.9 |
| Senai | 27.5 / 23.5 / 31.3 | 27.3 / 23.2 / 31.3 | 27.0 / 22.7 / 31.3 | 26.1 | 22.8 |
| Kota Bharu | 27.3 / 23.1 / 31.1 | 26.9 / 22.5 / 31.0 | 26.5 / 22.0 / 30.1 | 25.8 | 23.0 |
| Kuching | 26.9 / 22.6 / 30.9 | 26.5 / 22.0 / 29.6 | 26.3 / 21.8 / 29.6 | 25.2 | 22.8 |
| Kota Kinabalu | 28.1 / 24.3 / 33.1 | 27.6 / 23.6 / 32.9 | 27.4 / 23.2 / 32.1 | 26.9 | 23.2 |

### 6.4 Cross-check against ASHRAE 2021 (ASHRAE / this study)

| Station | ASHRAE years | 0.4 % DB | MCWB | 0.4 % DP | HR (g/kg) | 99 % heating DB / 1 % cold |
|---|---|---|---|---|---|---|
| Subang | 1994-2019 | 35.0 / 35.2 | 26.3 / 26.3 | 27.0 / 26.6 | 22.8 / 22.2 | 23.4 / 23.6 |
| KLIA | 2005-2019 | 34.2 / 34.5 | 25.7 / 26.1 | 27.0 / 26.6 | 22.8 / 22.3 | 23.0 / 23.5 |
| Ipoh | 2004-2019 | 35.0 / 35.1 | 26.1 / 26.2 | 26.9 / 26.9 | 22.7 / 22.7 | 22.8 / 23.0 |
| Penang | 1994-2019 | 33.2 / 34.1 | 26.3 / 26.4 | 27.1 / 27.3 | 22.8 / 23.1 | 23.8 / 23.9 |
| Senai | 2000-2019 | 34.0 / 34.4 | 27.3 / 27.5 | 27.2 / 27.5 | 23.1 / 23.5 | 22.1 / 22.8 |
| Kota Bharu | 1994-2019 | 33.2 / 33.9 | 26.8 / 27.2 | 27.0 / 27.3 | 22.7 / 23.1 | 22.8 / 23.0 |
| Kuching | 1994-2019 | 34.1 / 34.5 | 26.2 / 26.7 | 26.4 / 26.9 | 22.0 / 22.6 | 22.6 / 22.8 |
| Kota Kinabalu | 1994-2019 | 34.1 / 34.4 | 28.3 / 28.4 | 27.9 / 28.1 | 24.0 / 24.3 | 23.0 / 23.2 |

| Reading of the cross-check | Detail |
|---|---|
| Agreement | Dry bulb within 0.9 °C, dew point within 0.5 °C, everywhere |
| Why mine run a little warmer | My years (2015-2024) are newer than ASHRAE's (from 1994); the climate has warmed |
| Kota Kinabalu | Dew points of 28 °C are very high. Both sources show them, so they are in the station record. A sensor bias is possible (unverified). |

### 6.5 Cross-check against ERA5 (Open-Meteo, the same points, 2015-2024)

| Station | 0.4 % DB station / ERA5 | 0.4 % DP station / ERA5 | Mean daily max station / ERA5 | Mean daily min station / ERA5 | Hot-day peak, same dates, station / ERA5 |
|---|---|---|---|---|---|
| Subang | 35.2 / 34.3 | 26.6 / 27.2 | 32.9 / 32.1 | 25.0 / 24.8 | 34.8 / 33.3 |
| KLIA | 34.5 / 33.1 | 26.6 / 26.7 | 32.1 / 31.1 | 24.7 / 25.3 | 33.7 / 32.4 |
| Ipoh | 35.1 / 34.9 | 26.9 / 27.2 | 32.7 / 32.3 | 24.4 / 24.6 | 34.8 / 33.8 |
| Penang | 34.1 / 34.5 | 27.3 / 27.1 | 31.9 / 32.2 | 25.5 / 25.3 | 33.7 / 33.4 |
| Senai | 34.4 / 33.0 | 27.5 / 27.7 | 32.1 / 31.0 | 24.2 / 24.4 | 33.6 / 32.2 |
| Kota Bharu | 33.9 / 34.7 | 27.3 / 27.2 | 31.2 / 31.7 | 24.6 / 25.1 | 32.9 / 33.3 |
| Kuching | 34.5 / 33.9 | 26.9 / 27.4 | 31.9 / 31.4 | 24.0 / 23.9 | 33.6 / 33.1 |
| Kota Kinabalu | 34.4 / 31.7 | 28.1 / 26.9 | 32.2 / 29.9 | 24.5 / 26.0 | 33.7 / 30.7 |

| Reading | Detail |
|---|---|
| Peaks | On the same hot dates ERA5 is 0.3 to 1.5 °C lower at six points, 3.0 °C lower at Kota Kinabalu (its grid cell is partly sea) and 0.4 °C higher at Kota Bharu |
| Moisture | ERA5 dew points are close (within 0.6 °C) except Kota Kinabalu |
| Use | Good for solar and for moisture; not for hot-day peaks without a correction |

## 7. Proposed design days

Full hourly profiles: appendix A and the JSON file. Ranges below are the day's minimum to maximum.

### 7.1 Day summaries

| Station | Hot: T °C / RH % / mean water g/m³ | Humid: T / RH / water | Wet: T / RH / water | Typical: T / RH / water |
|---|---|---|---|---|
| Subang | 26.3–35.2 / 50–87 / 21.4 | 26.7–33.3 / 66–93 / 24.1 | 23.6–27.3 / 79–96 / 20.5 | 25.3–32.1 / 61–91 / 21.4 |
| KLIA | 26.3–34.5 / 53–83 / 21.0 | 26.6–32.0 / 71–93 / 23.8 | 23.5–26.2 / 85–96 / 20.6 | 25.1–31.4 / 66–91 / 21.5 |
| Ipoh | 25.5–35.1 / 50–85 / 20.9 | 26.1–32.7 / 69–95 / 24.0 | 23.0–27.0 / 81–98 / 20.4 | 24.6–32.1 / 62–91 / 21.2 |
| Penang | 27.2–34.1 / 56–81 / 21.5 | 28.0–32.7 / 71–91 / 24.9 | 23.9–26.0 / 87–95 / 20.9 | 25.9–31.3 / 67–88 / 21.8 |
| Senai | 25.4–34.4 / 60–91 / 22.5 | 25.7–33.2 / 71–97 / 24.6 | 22.8–24.9 / 92–98 / 20.3 | 24.4–31.0 / 71–96 / 22.3 |
| Kota Bharu | 26.6–33.9 / 60–86 / 22.3 | 26.6–32.4 / 73–94 / 24.5 | 23.0–24.2 / 94–98 / 20.5 | 24.9–30.6 / 71–92 / 21.8 |
| Kuching | 25.5–34.5 / 56–90 / 21.9 | 25.9–31.4 / 74–97 / 24.0 | 22.8–24.3 / 92–98 / 20.2 | 24.3–30.9 / 69–96 / 21.8 |
| Kota Kinabalu | 26.1–34.4 / 64–83 / 22.4 | 26.4–33.7 / 72–92 / 24.7 | 23.2–26.8 / 85–96 / 20.6 | 24.7–31.7 / 71–90 / 22.1 |
| Today's estimates | 24–34 / 50–90 / 19.7 | 25–32 / 70–95 / 22.9 | 23–28 / 85–98 / 21.7 | none |

### 7.2 How far today's days are off (today minus station; range over the 8 stations)

| Day | Peak T | Night T | Mean water content | Mean dew point | Verdict |
|---|---|---|---|---|---|
| Hot-dry vs Hot | −1.2 to +0.1 °C | −3.2 to −1.4 °C | −2.8 to −1.2 g/m³ | −2.2 to −1.0 °C | Too dry and too cool at night. "Hot-dry" does not exist here: hot afternoons have RH 50 to 65 %, but the water content is average. |
| Hot-humid vs Humid | −1.7 to +0.6 °C | −3.0 to −0.7 °C | −2.0 to −0.9 g/m³ | −1.5 to −0.7 °C | Too mild. This is the day that limits grey oyster, so the error goes straight into the capacity. |
| Mild/rainy vs Wet | +0.7 to +3.8 °C | −0.9 to +0.2 °C | +0.8 to +1.5 g/m³ | +0.6 to +1.3 °C | About right. A little harsh: warmer and wetter by day. Its night is right for the east and Borneo, slightly cold for the west coast. |

### 7.3 Effect on the capacity check (default room, 60 m³, uncalibrated, machines of `ClimateSim.PLANT`)

| Design days | Grey oyster, plan 2,000: step-1 estimate | Grey oyster: capacity (verdict; limiting day) | Golden oyster, plan 1,000: step-1 estimate | Golden oyster: capacity (verdict; limiting day) |
|---|---|---|---|---|
| Today (estimates) | 3,039 | 3,652 (good; Hot-humid: too hot) | 1,831 | 229 (too dense; Mild/rainy: near saturation) |
| Subang | 2,629 | 3,053 (good; Humid: too hot) | 1,577 | 1,769 (good; Humid: near saturation) |
| KLIA | 2,831 | 3,288 (good; Humid: too hot) | 1,702 | 2,046 (too empty; Humid: too hot, near saturation) |
| Ipoh | 2,699 | 3,134 (good; Humid: too hot) | 1,620 | 348 (too dense; Wet: near saturation) |
| Penang | 2,483 | 2,884 (good; Humid: too hot) | 1,487 | 1,487 (good; Humid: near saturation) |
| Senai | 2,327 | 2,609 (good; Humid: too hot) | 1,392 | 378 (too dense; Wet: near saturation) |
| Kota Bharu | 2,506 | 2,910 (good; Humid: too hot) | 1,506 | 296 (too dense; Wet: near saturation) |
| Kuching | 2,934 | 3,407 (good; Humid: too hot) | 1,782 | 348 (too dense; Wet: near saturation) |
| Kota Kinabalu | 2,106 | 2,393 (good; Humid: too hot) | 1,258 | 1,512 (good; Humid: too hot) |

| Same check with Typical in slot 3 instead of Wet | Grey oyster capacity | Golden oyster capacity |
|---|---|---|
| Subang | 3,053 (good) | 1,769 (good) |
| KLIA | 3,288 (good) | 2,046 (too empty) |
| Ipoh | 3,134 (good) | 1,686 (good) |
| Penang | 2,884 (good) | 1,487 (good) |
| Senai | 2,609 (good) | 1,561 (good) |
| Kota Bharu | 2,910 (good) | 1,810 (good) |
| Kuching | 3,407 (good) | 1,685 (good) |
| Kota Kinabalu | 2,393 (good) | 1,512 (good) |

| Reading | Detail |
|---|---|
| Grey oyster | The humid day limits it everywhere. Today's mild humid day overstates capacity by 7 % (Kuching) to 53 % (Kota Kinabalu); Subang 20 %. |
| Golden oyster | The coolest wet night decides. Golden's fruiting target is 24 °C with a ±1 °C band (`controller.js` `BANDS.T`). A wet night at 23.0 °C or below (Ipoh, Senai, Kota Bharu, Kuching, and today's estimate) makes a sparse room too wet; at 23.2 °C or above (Kota Kinabalu, Subang, KLIA, Penang) it passes. A 0.2 °C change flips the verdict. |
| Golden "too dense" is the known gap | The check finds a pass near 50 blocks, fails at about 300, and stops; it does not search above the wet band. This is the roadmap item "find every pass window". |
| Slot 3 | A typical day hides the wet failure in every region. Keep a wet stress day in slot 3. |

### 7.4 How often a cool, saturated night happens (nights per year, 00:00-07:00, 2015-2024)

| Station | Minimum ≤ 23 °C | Minimum ≤ 23 °C and mean RH ≥ 95 % | Minimum ≤ 24 °C | Minimum ≤ 24 °C and mean RH ≥ 95 % | Mean night minimum |
|---|---|---|---|---|---|
| Subang | 12.3 | 2.0 | 77.5 | 16.1 | 25.2 |
| KLIA | 19.5 | 5.1 | 106.4 | 23.2 | 24.9 |
| Ipoh | 47.3 | 13.9 | 182.4 | 43.6 | 24.5 |
| Penang | 5.9 | 1.7 | 43.6 | 9.6 | 25.7 |
| Senai | 51.4 | 27.3 | 214.9 | 118.9 | 24.3 |
| Kota Bharu | 35.4 | 9.8 | 145.4 | 41.5 | 24.7 |
| Kuching | 68.4 | 52.3 | 239.8 | 156.4 | 24.1 |
| Kota Kinabalu | 34.4 | 8.3 | 156.5 | 27.8 | 24.6 |

### 7.5 Solar by day type (ERA5 via Open-Meteo, mean of the same dates; W/m² peak / kWh/m² per day)

| Station | Hot day | Humid day | Rainy day (lowest 2 % daily max) | All days |
|---|---|---|---|---|
| Subang | 854 / 6.16 | 764 / 5.29 | 494 / 3.16 | 790 / 5.21 |
| KLIA | 831 / 6.01 | 687 / 4.84 | 493 / 3.17 | 774 / 5.11 |
| Ipoh | 845 / 6.05 | 665 / 4.50 | 449 / 2.86 | 770 / 4.97 |
| Penang | 825 / 5.87 | 730 / 4.80 | 491 / 3.16 | 773 / 4.95 |
| Senai | 750 / 5.43 | 680 / 4.99 | 399 / 2.37 | 712 / 4.64 |
| Kota Bharu | 856 / 6.12 | 857 / 6.16 | 348 / 2.20 | 796 / 5.32 |
| Kuching | 819 / 5.80 | 666 / 4.65 | 442 / 2.81 | 740 / 4.78 |
| Kota Kinabalu | 833 / 5.83 | 782 / 5.46 | 474 / 2.95 | 783 / 5.09 |

| Reading | Detail |
|---|---|
| Today | Every design day gets the same full sun. A rainy day really gets about 40 to 60 % of a hot day's peak sun. |
| Effect | Full sun on the wet day adds heat, which runs the AC, which dries the room. So today the wet day is slightly easier than it should be. |
| Suggestion | An optional `sun` factor per design day (hot 1.0, humid about 0.85, wet about 0.55). Needs a small `sim.js` change, so it belongs in the spec, not here. |

### 7.6 How wet the wet days are

| Station | Median daily-mean RH | 98th percentile daily-mean RH | Hours above 95 % RH on a wet day | Hours above 95 % RH on an average day |
|---|---|---|---|---|
| Subang | 79.4 | 89.8 | 5.7 | 0.8 |
| KLIA | 80.8 | 90.5 | 6.4 | 1.0 |
| Ipoh | 81.6 | 90.9 | 7.2 | 1.3 |
| Penang | 79.5 | 89.4 | 5.1 | 0.6 |
| Senai | 86.3 | 94.5 | 10.9 | 3.4 |
| Kota Bharu | 82.4 | 94.8 | 13.8 | 1.6 |
| Kuching | 86.0 | 94.3 | 12.3 | 4.4 |
| Kota Kinabalu | 82.4 | 91.5 | 8.4 | 1.1 |

## 8. Sketch: editable design days (for the future spec, not code)

| Part | Suggestion |
|---|---|
| Region record | `{ key, name, source, years, editable, days: [{ name, role, T[24], RH[24], sun? }] }`. `role` is `hot`, `humid` or `wet`, so code stops relying on the array index. |
| Built-in regions | The eight stations of the JSON file plus today's `my-lowland`, read-only. "Copy to edit" makes an editable region. |
| Where a room gets its weather | A new `room.region` field (default: the farm's region). The capacity check, the cycle and the equipment check (C8) all read it. |
| Storage | The same store as rooms (browser storage now, the farm database later). Export and import as JSON in the shape of the JSON file. |
| Editor, simple mode | Four numbers per day as today (`tLo`, `tHi`, `rhLo`, `rhHi`), with the low hour set to 07:00 to match the data. Good for "what if 2 °C hotter". |
| Editor, full mode | A 24-row table of T and RH per day, with a small chart. Paste from a spreadsheet. |
| Derived columns shown | Dew point and water content (g/m³) per hour, so the user sees what the fresh air brings in |
| Checks on save | 24 values per day; T between 10 and 45 °C; RH between 1 and 100 %; warn when the dew point is above 28.5 °C or the water content leaves the station range; warn when a day has no hour within ±1 °C of its neighbours' trend (typos) |
| Report | Each capacity or cycle report stores the region key and a copy of the days used, so old reports stay explainable after an edit |
| Labels | "Station data (ISD, 2015-2024)" or "Edited by <user>, <date>" instead of "estimates" |
| Contract impact | `docs/contracts/cycle.md` section 6 fixes three days and `days[k % 3]`. Allowing more days or roles changes that contract: a C-number change, agreed before building. |

## 9. Open questions for the owner

| # | Question | Why it matters | My suggestion |
|---|---|---|---|
| 1 | Where is the farm? Which town or district? | Picks the station. The wet night alone moves golden capacity from about 300 to about 1,700 blocks. | Tell us the town; we use the nearest station, or the harsher of two. |
| 2 | May derived ISD design days go into the public GitHub repo? | NOAA: non-U.S. ISD data "cannot be redistributed". The JSON holds averaged profiles, not raw data, but this is unresolved. | Keep the branch local until decided. Options: buy MetMalaysia data with a clear licence, or rebuild from ERA5 (CC BY 4.0) plus ASHRAE peaks. |
| 3 | Buy MetMalaysia hourly T and RH for the farm's station? | Official data, likely a clean licence, small cost | Yes, once the location is known. Ask myMETdata what RM20 covers (per station, per year?) and the reuse terms. |
| 4 | Slot 3: wet stress day or typical day? The lead asked for a typical day. | A typical day hides the "too wet" failure (section 7.3) | Wet in slot 3. Keep Typical for energy and cost estimates (Economics). |
| 5 | Which severity? I used 0.4 % for heat, 1 % of days for humidity, 2 % of days plus the 1 % cold night for wet. | Harsher days mean fewer blocks and more machines | Keep these. Show the level on the page. |
| 6 | Add a sun factor per design day? | Wet days get about 55 % of the sun; today all days get full sun | Yes, in the spec for editable design days |
| 7 | The golden oyster knife-edge at a 23 °C wet night: accept it, or design for margin? | A 0.2 °C change flips the verdict | Hand to the C8 / pass-window work; report the margin, not only pass/fail |
| 8 | Kota Kinabalu dew points of 28 °C: trust them? | They make Kota Kinabalu the harshest humid site | Only matters if the farm is in Sabah; then cross-check with MetMalaysia data |
| 9 | Should the analysis scripts go into the repo (for example `tools/weather/`)? | Today they live outside the repo (see section 10) | Yes, if the licence question is settled |

## 10. How to reproduce

| Step | Detail |
|---|---|
| Download | ISD-Lite files `https://www.ncei.noaa.gov/pub/data/noaa/isd-lite/<year>/<id>-99999-<year>.gz` for 2015-2024 (5.3 MB in total); ASHRAE values from `ashrae-meteo.info` (POST `request_meteo_parametres.php`); ERA5 from the Open-Meteo archive API |
| Where | Data in `~/.cache/mf-research/weather-data/`; scripts in `~/.cache/mf-research/weather-scripts/`; results in `~/.cache/mf-research/weather-out/`. Not in the repo. |
| Scripts | `design_days.py` (percentiles, composites), `wet_days.py`, `cool_wet_nights.py`, `build_days.py` (the JSON), `era5_check.py`, `ashrae_table.py`, `compare_app.js` (runs the app's `ClimateCapacity.check`), `gen_tables.py` |
| Station ids | Subang 486470, KLIA 486500, Ipoh 486023 (WMKI; the old id 486250 stops in 2022), Penang 486010, Senai 486790, Kota Bharu 486150, Kuching 964130, Kota Kinabalu 964710 |
| Note | NOAA's `global-hourly` CSV path now redirects to an AWS bucket (`noaa-global-hourly-pds`); ISD-Lite still downloads from NCEI |

## 11. Sources

| Claim | URL |
|---|---|
| MetMalaysia open data: forecasts, warnings, climate change APIs | https://www.met.gov.my/en/info/data-terbuka/ |
| MetMalaysia API, token sign-up | https://api.met.gov.my/ |
| MetMalaysia API data types and older rate limits (community notes, January 2022) | https://gist.github.com/tnwei/96c657a35ad2c8af72aea8773b500106 and https://github.com/hrbrmstr/mywx |
| New MetMalaysia API portal (forecasts, warnings, earthquakes) | https://metapi2.met.gov.my/ |
| data.gov.my weather API: forecast and warnings only | https://developer.data.gov.my/realtime-api/weather |
| myMETdata: hourly data, parameters, 3-5 working days | https://mymetdata.met.gov.my/faq |
| myMETdata prices: hourly dry bulb and RH, RM20 each | https://mymetdata.met.gov.my/shop/category/met-data/1 |
| MetMalaysia fees order 2010 (not read; per a search summary, RM20 per parameter per station, unverified) | https://mymetdata.met.gov.my/docs/akta-fi-metmalaysia.pdf |
| NOAA ISD: hourly, over 35,000 stations, ISD-Lite | https://www.ncei.noaa.gov/products/land-based-station/integrated-surface-database |
| ISD non-U.S. data: WMO Resolution 40, "cannot be redistributed" | https://www.ncei.noaa.gov/pub/data/noaa/readme.txt |
| ISD station list | https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv |
| ASHRAE 2021 design conditions, Malaysian stations | https://ashrae-meteo.info/v3.0/places.php?continent=Asia |
| ASHRAE design condition definitions | https://ashrae-meteo.info/v3.0/help.php |
| ASHRAE Handbook chapter 14 (subscription; not read) | https://handbook.ashrae.org/Handbooks/F17/SI/f17_ch14/f17_ch14_si.aspx |
| Design-day profile from the ASHRAE fraction table, same shape for wet bulb | https://bigladdersoftware.com/epx/docs/22-1/engineering-reference/climate-calculations.html |
| Open-Meteo data licence CC BY 4.0 | https://open-meteo.com/en/licence |
| Open-Meteo free API is non-commercial; 10,000 calls/day | https://open-meteo.com/en/terms |
| Open-Meteo historical models and resolutions | https://open-meteo.com/en/docs/historical-weather-api |
| ERA5 under CC BY 4.0 from 2 July 2025 | https://forum.ecmwf.int/t/cc-by-licence-to-replace-licence-to-use-copernicus-products-on-02-july-2025/13464 |
| NASA POWER hourly from 2001 | https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ |
| NASA POWER grid 0.5° × 0.625° (per a search summary) | https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/ |
| NASA POWER: no restrictions on use, cite the project | https://registry.opendata.aws/nasa-power/ |
| Meteostat data CC BY 4.0; covers only what Meteostat redistributes | https://dev.meteostat.net/license |

## Appendix A. Hourly profiles (T °C / RH %, hour in Malaysia time)

### A.1 Subang (Kuala Lumpur) (ISD 486470, 2015-2024)

| Hour | Hot T / RH | Humid T / RH | Wet T / RH | Typical T / RH |
|---|---|---|---|---|
| 00 | 28.0 / 81.3 | 28.0 / 89.4 | 24.2 / 94.1 | 26.8 / 86.1 |
| 01 | 27.7 / 82.7 | 27.8 / 90.7 | 24.1 / 94.4 | 26.5 / 87.3 |
| 02 | 27.4 / 83.7 | 27.6 / 90.8 | 24.0 / 94.6 | 26.2 / 88.2 |
| 03 | 27.2 / 84.4 | 27.4 / 91.6 | 23.9 / 95.3 | 26.0 / 88.9 |
| 04 | 26.9 / 85.3 | 27.1 / 92.6 | 23.8 / 94.9 | 25.8 / 89.6 |
| 05 | 26.6 / 85.9 | 27.0 / 92.2 | 23.7 / 95.0 | 25.6 / 90.1 |
| 06 | 26.4 / 86.5 | 26.9 / 92.3 | 23.7 / 95.4 | 25.5 / 90.5 |
| 07 | 26.3 / 86.9 | 26.7 / 92.8 | 23.6 / 95.6 | 25.3 / 90.7 |
| 08 | 26.6 / 85.4 | 27.1 / 92.0 | 23.9 / 94.6 | 25.6 / 89.7 |
| 09 | 28.6 / 76.7 | 28.7 / 85.9 | 24.9 / 90.3 | 27.1 / 83.2 |
| 10 | 30.5 / 68.0 | 30.2 / 78.8 | 25.9 / 85.4 | 28.7 / 75.1 |
| 11 | 32.0 / 61.4 | 31.5 / 72.2 | 26.7 / 81.3 | 30.1 / 68.8 |
| 12 | 33.2 / 56.6 | 32.6 / 68.5 | 27.3 / 78.7 | 31.1 / 64.6 |
| 13 | 34.2 / 53.0 | 33.3 / 65.9 | 26.9 / 80.6 | 31.8 / 61.9 |
| 14 | 34.8 / 51.0 | 33.3 / 65.9 | 26.4 / 83.4 | 32.1 / 60.9 |
| 15 | 35.2 / 50.1 | 33.0 / 68.0 | 25.7 / 87.5 | 31.9 / 62.1 |
| 16 | 34.5 / 53.9 | 32.2 / 72.8 | 24.8 / 90.8 | 31.3 / 65.0 |
| 17 | 33.1 / 59.2 | 31.3 / 75.2 | 24.4 / 91.7 | 30.4 / 68.3 |
| 18 | 31.7 / 64.2 | 30.1 / 80.8 | 24.4 / 92.1 | 29.6 / 71.8 |
| 19 | 30.5 / 68.9 | 29.2 / 84.7 | 24.2 / 92.4 | 28.7 / 75.5 |
| 20 | 29.4 / 73.7 | 28.5 / 87.0 | 24.0 / 93.7 | 28.0 / 79.3 |
| 21 | 29.0 / 76.4 | 28.3 / 88.0 | 23.9 / 94.3 | 27.6 / 81.8 |
| 22 | 28.7 / 78.0 | 28.0 / 89.1 | 23.8 / 95.0 | 27.3 / 83.5 |
| 23 | 28.4 / 79.4 | 27.7 / 89.9 | 23.6 / 95.4 | 27.0 / 85.0 |

### A.2 KLIA (Sepang) (ISD 486500, 2015-2024)

| Hour | Hot T / RH | Humid T / RH | Wet T / RH | Typical T / RH |
|---|---|---|---|---|
| 00 | 28.0 / 78.9 | 27.8 / 88.0 | 24.4 / 92.8 | 26.6 / 86.2 |
| 01 | 27.7 / 79.7 | 27.4 / 90.3 | 24.2 / 93.5 | 26.3 / 87.2 |
| 02 | 27.4 / 80.3 | 27.2 / 90.5 | 24.0 / 93.8 | 26.0 / 88.0 |
| 03 | 27.2 / 81.0 | 27.1 / 91.3 | 23.9 / 94.2 | 25.8 / 88.7 |
| 04 | 26.9 / 81.4 | 26.9 / 91.9 | 23.7 / 95.1 | 25.6 / 89.4 |
| 05 | 26.7 / 81.8 | 26.7 / 92.6 | 23.6 / 95.1 | 25.3 / 90.0 |
| 06 | 26.5 / 82.3 | 26.6 / 92.6 | 23.6 / 95.5 | 25.2 / 90.2 |
| 07 | 26.3 / 82.7 | 26.6 / 93.2 | 23.5 / 95.6 | 25.1 / 90.6 |
| 08 | 26.8 / 80.9 | 27.1 / 91.3 | 23.8 / 94.7 | 25.5 / 89.4 |
| 09 | 28.8 / 72.9 | 28.8 / 84.5 | 24.5 / 91.9 | 27.0 / 83.1 |
| 10 | 30.7 / 65.8 | 30.2 / 78.5 | 25.4 / 88.5 | 28.6 / 76.7 |
| 11 | 32.2 / 60.0 | 31.2 / 73.7 | 25.9 / 86.2 | 29.7 / 71.5 |
| 12 | 33.4 / 55.9 | 31.8 / 71.8 | 26.2 / 85.3 | 30.7 / 67.9 |
| 13 | 34.3 / 53.0 | 31.8 / 72.6 | 26.1 / 85.6 | 31.2 / 65.9 |
| 14 | 34.5 / 52.7 | 31.9 / 71.3 | 25.5 / 87.7 | 31.4 / 65.6 |
| 15 | 34.5 / 53.5 | 32.0 / 72.3 | 25.2 / 89.5 | 31.2 / 66.6 |
| 16 | 33.8 / 56.7 | 31.3 / 74.8 | 25.0 / 90.1 | 30.8 / 68.2 |
| 17 | 32.8 / 60.1 | 30.7 / 76.6 | 24.8 / 90.4 | 30.2 / 70.2 |
| 18 | 31.6 / 64.4 | 30.4 / 77.7 | 24.5 / 91.9 | 29.5 / 73.4 |
| 19 | 30.4 / 70.0 | 29.5 / 81.4 | 24.2 / 94.0 | 28.6 / 78.1 |
| 20 | 29.3 / 75.0 | 28.7 / 84.5 | 24.0 / 93.8 | 27.6 / 82.1 |
| 21 | 28.8 / 77.4 | 28.3 / 86.2 | 23.8 / 94.9 | 27.2 / 84.1 |
| 22 | 28.6 / 78.2 | 28.1 / 86.5 | 23.7 / 95.0 | 27.0 / 85.0 |
| 23 | 28.3 / 78.6 | 27.8 / 87.2 | 23.7 / 95.0 | 26.7 / 85.6 |

### A.3 Ipoh (ISD 486023, 2015-2024)

| Hour | Hot T / RH | Humid T / RH | Wet T / RH | Typical T / RH |
|---|---|---|---|---|
| 00 | 27.4 / 83.2 | 27.1 / 92.9 | 23.7 / 95.8 | 25.9 / 89.6 |
| 01 | 27.1 / 83.6 | 27.1 / 93.9 | 23.6 / 96.6 | 25.7 / 89.8 |
| 02 | 26.8 / 83.6 | 27.1 / 93.2 | 23.5 / 96.5 | 25.5 / 89.8 |
| 03 | 26.5 / 83.8 | 26.8 / 94.0 | 23.4 / 96.4 | 25.3 / 89.9 |
| 04 | 26.3 / 83.8 | 26.7 / 93.4 | 23.3 / 96.7 | 25.1 / 90.0 |
| 05 | 26.0 / 83.9 | 26.5 / 93.5 | 23.1 / 96.8 | 24.9 / 90.2 |
| 06 | 25.8 / 84.2 | 26.2 / 95.2 | 23.0 / 97.5 | 24.8 / 90.5 |
| 07 | 25.5 / 84.8 | 26.1 / 94.9 | 23.0 / 97.2 | 24.6 / 90.7 |
| 08 | 25.9 / 82.8 | 26.7 / 92.3 | 23.3 / 96.0 | 24.9 / 89.4 |
| 09 | 27.6 / 75.7 | 27.9 / 87.7 | 24.1 / 92.5 | 26.3 / 83.7 |
| 10 | 29.5 / 68.9 | 29.3 / 82.1 | 25.2 / 87.8 | 27.9 / 77.3 |
| 11 | 31.3 / 63.2 | 30.9 / 75.6 | 26.1 / 83.9 | 29.5 / 71.4 |
| 12 | 32.8 / 57.8 | 31.9 / 71.6 | 26.8 / 81.1 | 30.8 / 66.4 |
| 13 | 33.9 / 53.7 | 32.5 / 69.7 | 27.0 / 80.5 | 31.7 / 63.3 |
| 14 | 34.7 / 51.1 | 32.7 / 68.8 | 26.6 / 82.9 | 32.1 / 62.2 |
| 15 | 35.1 / 50.4 | 32.4 / 69.8 | 25.7 / 86.1 | 31.9 / 63.2 |
| 16 | 34.7 / 52.2 | 31.9 / 71.4 | 24.9 / 89.0 | 31.2 / 66.0 |
| 17 | 33.6 / 56.2 | 31.1 / 74.7 | 24.7 / 90.6 | 30.3 / 69.7 |
| 18 | 32.0 / 62.7 | 29.8 / 80.9 | 24.4 / 92.3 | 29.2 / 74.4 |
| 19 | 30.5 / 69.2 | 28.9 / 84.5 | 23.9 / 94.5 | 28.1 / 79.5 |
| 20 | 29.3 / 74.7 | 27.9 / 89.1 | 23.6 / 96.0 | 27.2 / 84.0 |
| 21 | 28.6 / 78.2 | 27.6 / 91.1 | 23.5 / 96.1 | 26.7 / 86.5 |
| 22 | 28.1 / 80.8 | 27.3 / 91.9 | 23.4 / 96.7 | 26.4 / 88.0 |
| 23 | 27.8 / 82.4 | 27.0 / 93.2 | 23.3 / 96.4 | 26.1 / 89.1 |

### A.4 Penang (Bayan Lepas) (ISD 486010, 2015-2024)

| Hour | Hot T / RH | Humid T / RH | Wet T / RH | Typical T / RH |
|---|---|---|---|---|
| 00 | 29.1 / 77.1 | 29.5 / 84.5 | 24.9 / 92.5 | 27.3 / 84.2 |
| 01 | 28.8 / 78.1 | 29.1 / 86.5 | 24.8 / 93.0 | 27.1 / 85.0 |
| 02 | 28.3 / 79.2 | 28.9 / 88.1 | 24.6 / 93.3 | 26.8 / 85.8 |
| 03 | 28.1 / 79.9 | 28.6 / 89.0 | 24.3 / 94.1 | 26.6 / 86.4 |
| 04 | 27.8 / 80.6 | 28.5 / 89.3 | 24.2 / 94.3 | 26.4 / 86.8 |
| 05 | 27.5 / 80.7 | 28.2 / 90.2 | 24.0 / 95.1 | 26.1 / 87.2 |
| 06 | 27.3 / 80.9 | 28.2 / 90.5 | 24.0 / 94.8 | 26.0 / 87.5 |
| 07 | 27.2 / 81.1 | 28.0 / 90.6 | 23.9 / 94.9 | 25.9 / 87.6 |
| 08 | 27.6 / 79.6 | 28.6 / 89.0 | 24.1 / 94.3 | 26.3 / 86.5 |
| 09 | 29.2 / 73.7 | 29.8 / 83.5 | 24.9 / 91.8 | 27.7 / 81.1 |
| 10 | 30.8 / 67.4 | 30.9 / 78.5 | 25.7 / 88.7 | 29.0 / 75.8 |
| 11 | 31.9 / 63.3 | 31.6 / 75.8 | 25.7 / 87.6 | 29.9 / 72.1 |
| 12 | 32.8 / 59.8 | 32.1 / 73.8 | 25.9 / 87.8 | 30.6 / 69.6 |
| 13 | 33.5 / 57.7 | 32.4 / 73.3 | 25.9 / 87.3 | 31.0 / 68.2 |
| 14 | 33.8 / 57.2 | 32.7 / 71.4 | 26.0 / 86.8 | 31.2 / 67.5 |
| 15 | 34.1 / 55.8 | 32.7 / 70.6 | 26.0 / 86.7 | 31.3 / 67.2 |
| 16 | 33.9 / 56.2 | 32.5 / 71.2 | 25.8 / 86.8 | 31.1 / 67.5 |
| 17 | 33.2 / 58.0 | 32.0 / 72.7 | 25.5 / 88.0 | 30.6 / 68.8 |
| 18 | 32.4 / 60.9 | 31.5 / 75.1 | 25.4 / 88.3 | 30.1 / 71.1 |
| 19 | 31.4 / 65.1 | 31.0 / 77.4 | 24.9 / 90.9 | 29.3 / 74.6 |
| 20 | 30.4 / 69.4 | 30.1 / 80.6 | 24.5 / 92.7 | 28.5 / 78.3 |
| 21 | 30.0 / 71.9 | 29.8 / 82.2 | 24.3 / 93.6 | 28.1 / 80.5 |
| 22 | 29.7 / 73.5 | 29.5 / 84.2 | 24.2 / 94.1 | 27.8 / 82.0 |
| 23 | 29.4 / 75.1 | 29.3 / 84.9 | 24.1 / 93.9 | 27.5 / 83.1 |

### A.5 Senai (Johor Bahru) (ISD 486790, 2015-2024)

| Hour | Hot T / RH | Humid T / RH | Wet T / RH | Typical T / RH |
|---|---|---|---|---|
| 00 | 26.9 / 87.4 | 27.0 / 93.8 | 23.5 / 96.1 | 25.6 / 92.8 |
| 01 | 26.6 / 88.5 | 26.8 / 94.6 | 23.4 / 96.8 | 25.3 / 93.7 |
| 02 | 26.2 / 89.2 | 26.5 / 95.3 | 23.2 / 96.8 | 25.0 / 94.3 |
| 03 | 26.1 / 89.7 | 26.3 / 95.7 | 23.2 / 97.3 | 24.9 / 94.8 |
| 04 | 25.8 / 90.4 | 26.1 / 96.2 | 23.0 / 97.9 | 24.7 / 95.2 |
| 05 | 25.7 / 90.6 | 25.9 / 97.0 | 23.0 / 97.5 | 24.6 / 95.4 |
| 06 | 25.5 / 90.7 | 25.8 / 96.8 | 22.8 / 98.1 | 24.5 / 95.6 |
| 07 | 25.4 / 91.0 | 25.7 / 97.0 | 22.8 / 98.0 | 24.4 / 95.7 |
| 08 | 26.0 / 89.9 | 26.3 / 95.7 | 23.1 / 97.2 | 24.9 / 94.7 |
| 09 | 28.3 / 83.8 | 28.5 / 89.2 | 23.8 / 95.2 | 26.7 / 89.5 |
| 10 | 30.4 / 75.9 | 30.2 / 83.4 | 24.6 / 92.2 | 28.5 / 82.6 |
| 11 | 31.9 / 69.8 | 31.5 / 78.6 | 24.9 / 91.6 | 29.7 / 77.0 |
| 12 | 33.0 / 65.2 | 32.5 / 74.5 | 24.8 / 91.8 | 30.6 / 73.6 |
| 13 | 33.9 / 62.0 | 32.6 / 73.5 | 24.3 / 92.4 | 31.0 / 71.7 |
| 14 | 34.4 / 60.1 | 33.1 / 71.5 | 24.2 / 93.1 | 31.0 / 71.1 |
| 15 | 34.4 / 59.7 | 33.2 / 71.2 | 23.8 / 94.3 | 30.7 / 72.1 |
| 16 | 33.5 / 62.5 | 32.2 / 73.9 | 23.8 / 94.4 | 30.1 / 74.1 |
| 17 | 32.1 / 67.0 | 31.0 / 78.9 | 23.8 / 94.8 | 29.4 / 76.6 |
| 18 | 30.7 / 71.5 | 29.7 / 82.9 | 23.8 / 94.1 | 28.7 / 79.5 |
| 19 | 29.5 / 76.1 | 28.9 / 86.7 | 23.6 / 95.0 | 27.8 / 83.2 |
| 20 | 28.6 / 79.8 | 28.2 / 89.0 | 23.3 / 96.0 | 27.0 / 86.5 |
| 21 | 28.0 / 82.5 | 27.7 / 91.3 | 23.1 / 96.9 | 26.5 / 88.8 |
| 22 | 27.6 / 84.4 | 27.4 / 92.5 | 23.0 / 97.2 | 26.2 / 90.4 |
| 23 | 27.2 / 85.9 | 27.1 / 93.4 | 22.9 / 96.8 | 25.8 / 91.8 |

### A.6 Kota Bharu (ISD 486150, 2015-2024)

| Hour | Hot T / RH | Humid T / RH | Wet T / RH | Typical T / RH |
|---|---|---|---|---|
| 00 | 28.3 / 81.0 | 28.3 / 88.9 | 23.8 / 95.6 | 26.3 / 87.9 |
| 01 | 28.0 / 81.8 | 28.1 / 89.2 | 23.6 / 96.4 | 26.1 / 88.8 |
| 02 | 27.7 / 82.7 | 27.7 / 90.7 | 23.4 / 96.8 | 25.8 / 89.6 |
| 03 | 27.4 / 83.6 | 27.4 / 92.0 | 23.3 / 97.1 | 25.6 / 90.3 |
| 04 | 27.1 / 84.3 | 27.2 / 91.5 | 23.3 / 97.2 | 25.4 / 91.0 |
| 05 | 26.9 / 84.8 | 26.8 / 92.7 | 23.2 / 96.7 | 25.1 / 91.5 |
| 06 | 26.7 / 85.4 | 26.7 / 93.8 | 23.1 / 97.6 | 25.0 / 92.0 |
| 07 | 26.6 / 85.6 | 26.6 / 93.0 | 23.0 / 97.6 | 24.9 / 92.2 |
| 08 | 27.1 / 83.6 | 27.0 / 92.3 | 23.1 / 97.3 | 25.3 / 91.1 |
| 09 | 29.0 / 76.9 | 28.6 / 86.6 | 23.5 / 96.6 | 26.7 / 85.7 |
| 10 | 30.9 / 69.7 | 30.2 / 79.9 | 23.7 / 95.9 | 28.3 / 79.3 |
| 11 | 32.4 / 63.7 | 31.4 / 75.5 | 24.0 / 94.9 | 29.5 / 74.1 |
| 12 | 33.4 / 60.5 | 32.2 / 73.6 | 24.1 / 94.9 | 30.3 / 71.4 |
| 13 | 33.9 / 59.7 | 32.4 / 72.8 | 24.1 / 95.1 | 30.6 / 70.6 |
| 14 | 33.8 / 60.5 | 32.4 / 73.0 | 24.1 / 94.7 | 30.6 / 70.8 |
| 15 | 33.7 / 61.7 | 32.3 / 73.5 | 24.2 / 94.6 | 30.6 / 71.5 |
| 16 | 33.2 / 63.5 | 32.1 / 74.3 | 24.1 / 95.2 | 30.3 / 72.5 |
| 17 | 32.6 / 65.6 | 31.7 / 75.3 | 24.2 / 94.0 | 29.8 / 74.1 |
| 18 | 31.8 / 68.2 | 31.0 / 77.5 | 24.1 / 94.2 | 29.2 / 76.4 |
| 19 | 30.7 / 72.3 | 30.2 / 81.6 | 23.8 / 96.0 | 28.2 / 80.1 |
| 20 | 29.7 / 75.9 | 29.5 / 83.6 | 23.7 / 96.2 | 27.5 / 83.2 |
| 21 | 29.3 / 77.8 | 29.1 / 84.9 | 23.6 / 96.9 | 27.1 / 84.8 |
| 22 | 28.9 / 79.1 | 28.6 / 86.7 | 23.5 / 96.9 | 26.8 / 86.0 |
| 23 | 28.5 / 80.2 | 28.3 / 88.0 | 23.4 / 96.8 | 26.5 / 87.0 |

### A.7 Kuching (ISD 964130, 2015-2024)

| Hour | Hot T / RH | Humid T / RH | Wet T / RH | Typical T / RH |
|---|---|---|---|---|
| 00 | 26.9 / 86.4 | 27.1 / 93.1 | 23.7 / 95.4 | 25.3 / 93.1 |
| 01 | 26.6 / 87.3 | 26.9 / 93.1 | 23.6 / 96.1 | 25.1 / 93.9 |
| 02 | 26.3 / 88.0 | 26.6 / 93.7 | 23.4 / 96.4 | 24.9 / 94.4 |
| 03 | 26.1 / 88.7 | 26.5 / 94.6 | 23.2 / 97.7 | 24.7 / 95.0 |
| 04 | 25.9 / 89.3 | 26.2 / 95.5 | 23.1 / 97.5 | 24.6 / 95.4 |
| 05 | 25.7 / 89.7 | 26.1 / 95.7 | 22.9 / 97.3 | 24.4 / 95.8 |
| 06 | 25.5 / 90.1 | 25.9 / 97.0 | 22.9 / 97.4 | 24.3 / 96.1 |
| 07 | 25.5 / 90.3 | 25.9 / 96.8 | 22.9 / 97.3 | 24.3 / 96.3 |
| 08 | 26.7 / 86.5 | 26.6 / 94.4 | 23.1 / 97.2 | 25.1 / 93.7 |
| 09 | 28.7 / 78.9 | 28.1 / 89.3 | 23.5 / 95.8 | 26.6 / 87.8 |
| 10 | 30.6 / 71.2 | 29.6 / 82.5 | 24.0 / 94.4 | 28.2 / 81.1 |
| 11 | 32.1 / 65.2 | 30.6 / 78.0 | 24.2 / 92.9 | 29.4 / 75.8 |
| 12 | 33.3 / 60.7 | 31.4 / 74.5 | 24.3 / 92.7 | 30.3 / 72.0 |
| 13 | 34.1 / 57.3 | 31.3 / 74.7 | 24.0 / 93.6 | 30.8 / 69.6 |
| 14 | 34.5 / 55.6 | 31.4 / 73.9 | 23.8 / 93.9 | 30.9 / 69.1 |
| 15 | 34.4 / 56.1 | 31.3 / 74.8 | 23.9 / 93.9 | 30.5 / 70.5 |
| 16 | 33.2 / 60.1 | 30.7 / 76.7 | 24.1 / 92.8 | 29.9 / 73.0 |
| 17 | 31.7 / 65.7 | 30.3 / 78.5 | 24.1 / 92.4 | 29.0 / 76.2 |
| 18 | 30.4 / 71.1 | 29.5 / 81.6 | 23.9 / 93.4 | 28.1 / 80.2 |
| 19 | 29.2 / 76.1 | 28.7 / 85.6 | 23.5 / 95.4 | 27.1 / 84.5 |
| 20 | 28.4 / 79.3 | 28.0 / 88.7 | 23.3 / 95.9 | 26.6 / 87.2 |
| 21 | 28.0 / 81.4 | 27.6 / 91.2 | 23.1 / 96.8 | 26.2 / 89.2 |
| 22 | 27.6 / 83.1 | 27.2 / 92.5 | 23.0 / 96.9 | 25.9 / 90.7 |
| 23 | 27.2 / 84.7 | 26.7 / 93.3 | 22.8 / 97.5 | 25.6 / 92.0 |

### A.8 Kota Kinabalu (ISD 964710, 2015-2024)

| Hour | Hot T / RH | Humid T / RH | Wet T / RH | Typical T / RH |
|---|---|---|---|---|
| 00 | 27.5 / 81.8 | 27.6 / 91.0 | 24.0 / 95.1 | 25.9 / 88.8 |
| 01 | 27.2 / 82.0 | 27.4 / 90.8 | 23.8 / 95.5 | 25.7 / 89.1 |
| 02 | 26.9 / 82.5 | 27.1 / 91.1 | 23.6 / 95.0 | 25.4 / 89.5 |
| 03 | 26.7 / 82.8 | 26.9 / 91.1 | 23.5 / 95.3 | 25.2 / 89.8 |
| 04 | 26.5 / 82.7 | 26.7 / 92.0 | 23.4 / 96.1 | 25.0 / 90.0 |
| 05 | 26.2 / 83.0 | 26.5 / 92.1 | 23.2 / 95.8 | 24.8 / 90.2 |
| 06 | 26.1 / 83.2 | 26.4 / 91.5 | 23.3 / 96.0 | 24.7 / 90.3 |
| 07 | 27.0 / 79.8 | 27.3 / 88.3 | 23.5 / 95.2 | 25.3 / 88.0 |
| 08 | 29.1 / 72.3 | 29.2 / 81.4 | 24.5 / 91.4 | 27.2 / 81.0 |
| 09 | 31.2 / 68.2 | 30.7 / 78.9 | 25.4 / 88.5 | 29.0 / 76.1 |
| 10 | 32.4 / 66.6 | 31.8 / 76.5 | 25.9 / 87.3 | 30.1 / 73.9 |
| 11 | 33.3 / 65.6 | 32.6 / 74.6 | 26.4 / 86.2 | 30.9 / 72.6 |
| 12 | 34.0 / 64.6 | 33.2 / 73.1 | 26.8 / 85.4 | 31.5 / 71.8 |
| 13 | 34.4 / 64.1 | 33.4 / 72.5 | 26.5 / 87.0 | 31.7 / 71.4 |
| 14 | 34.3 / 64.2 | 33.7 / 71.5 | 26.0 / 89.1 | 31.5 / 71.8 |
| 15 | 33.8 / 65.5 | 33.3 / 72.1 | 25.0 / 92.0 | 31.0 / 73.2 |
| 16 | 32.9 / 67.5 | 32.4 / 75.2 | 24.5 / 93.4 | 30.3 / 75.3 |
| 17 | 31.8 / 70.0 | 31.4 / 77.8 | 24.3 / 93.8 | 29.4 / 77.7 |
| 18 | 30.7 / 73.3 | 30.1 / 82.2 | 23.8 / 95.0 | 28.5 / 80.8 |
| 19 | 29.8 / 76.5 | 29.1 / 85.3 | 23.6 / 96.1 | 27.8 / 83.7 |
| 20 | 29.2 / 78.5 | 28.7 / 86.8 | 23.5 / 95.5 | 27.3 / 85.5 |
| 21 | 28.7 / 80.2 | 28.5 / 87.6 | 23.4 / 96.0 | 26.9 / 86.8 |
| 22 | 28.3 / 80.9 | 28.2 / 89.2 | 23.3 / 95.8 | 26.6 / 87.6 |
| 23 | 27.9 / 81.5 | 27.8 / 90.2 | 23.2 / 95.3 | 26.2 / 88.2 |

# Hardware findings: real sensors and machines for a 60 m³ room

## 0. About this document

| Item | Value |
|---|---|
| Purpose | Research for the roadmap item "Real sensors and machines (hardware adapter in place of the simulator)". Feeds the future spec; contains no app code |
| Date | 2026-10-09 |
| Branch | `docs/hardware-research` |
| Room | Insulated, about 60 m³, lowland Malaysia (outdoor 24–33 °C, design 33.3 °C db / 27.2 °C wb, from `2026-10-08-lionsmane-equipment-raw-findings.json`), split AC |
| Crop | Lion's mane: 18–22 °C, RH about 90 %, CO₂ ≤ 750–1000 ppm. Oyster crops also supported (grey oyster fruiting range 23–27 °C, `controller.js` `CROPS`) |
| Prices | Read on 2026-10-09. RM where a Malaysian seller was found; USD or EUR otherwise, not converted (no exchange rate sourced) |
| "calc" | Our own arithmetic from the sourced numbers in the same row |
| "unverified" | No source found. Treat as a guess |
| Shopee | Its pages need JavaScript and could not be read; Shopee prices are mostly missing |
| Totals | Where a price range was found, totals use the upper price |
| Earlier research | AC prices, HP sizes, TNB tariff, fogger sizes and wall U-values are in `2026-10-08-lionsmane-equipment-raw-findings.json` and are not repeated here |

## 1. Key findings

| # | Finding | Effect on the app | Source |
|---|---|---|---|
| 1 | An ordinary split AC is not rated for this room. Daikin CTXU: cooling indoor range 18–32 °C and **80 % RH max**; outside it "a safety device may work to stop the operation". Some Daikin models are rated from 21 °C indoor only. Panasonic rates down to 16 °C db / 11 °C wb. | The biggest risk is not the control link but whether a split can hold 18–20 °C at 90 % RH for months. Trial one room before buying for all. | https://www.daikin.eu/content/dam/document-library/operation-manuals/ac/split/ctxu-g/CTXU-G2V1B_3P232703-1_Operation%20manuals_English.pdf ; https://www.daikin.ch/content/dam/document-library/operation-manuals/ac/split/ft-h/FT15-20HEV1_IM_OM_3V007382-4D_Operation%20manuals_English.pdf ; https://www.panasonic.com/content/dam/Panasonic/support_manual/Air_Conditioner/English_03-F568-F569_other/F568746.pdf |
| 2 | The contract's safe state "air exchange on" is too strong for a cold room in the tropics. 1800 m³/h of 33 °C design air into a 20 °C / 90 % room is about 7.6 kW sensible + 10.5 kW latent ≈ 18 kW (calc). A 2.5 HP split gives about 6–7 kW. | When the server dies, the room warms toward outdoor in hours and the coil floods. Suggest a timed purge pattern in the node as the safe state, not continuous fans (open question Q1). | calc from the design conditions above and the default `airM3h` 1800 m³/h |
| 3 | Only the Vaisala GMP252 among the CO₂ sensors found is rated for 0–100 % RH (heated head). Senseair S8 and Sunrise: 0–85 %. SCD30, SCD41, K30, MH-Z19C: 0–95 % non-condensing. | A cheap CO₂ sensor inside a 90–95 % room works at or beyond its limit. | Section 3.2 |
| 4 | Every CO₂ sensor must have automatic baseline correction (ABC/ASC) **off**. The room never sees 400 ppm (purges stop at ≥ 600 ppm), so ABC would learn 600 as 400 and read about 200 ppm low within 1–2 months (calc). | The controller's `offsets.CO2` and a yearly check against a reference replace ABC. | https://senseair.com/the-senseair-abc-algorithm/ ; calc |
| 5 | Sensirion RH sensors read high after long exposure to > 80 % RH: about +3 % RH after 60 h (creep). The SHT4x heater removes it; readings right after a heater pulse are invalid. | A cheap SHT-based probe without a heater scheme reads high, so the fogger runs less and the room is drier than shown. | https://sensirion.com/resource/datasheet/sht4x ; https://sensirion.com/media/documents/A88858C9/629626D4/Application_Note_Creep_Mitigation_SHT4x.pdf |
| 6 | A 250 mm inline fan does not reach 1800 m³/h (Vents TT PRO 250: 1400 m³/h at 0 Pa). A 315 mm fan does (TT PRO 315: 2050 m³/h at 0 Pa). | The default `airM3h` 1800 needs 315 mm fans, each sized against the real duct and filter pressure. | https://ventilation-system.com/product/tt-pro-250/ ; https://ventilation-system.com/product/tt-pro-315/ |
| 7 | Cheap Modbus relay boards (Waveshare, Eletechsup) have no documented communication watchdog. ESPHome (restarting script), Advantech ADAM and Moxa ioLogik do. | The 5 min fail-safe must live in the room node's firmware or an industrial I/O module, plus the relay wiring (section 4). | Section 3.7 |
| 8 | IR to the AC is one-way. Several IR protocols carry toggle bits (Midea swing/turbo, Panasonic AC32 power toggle): resending them flips the setting. Midea/Coolix IR goes down to 17 °C only, whole degrees. | The contract's "resend the AC command every 10 min" is safe only with full-state codes. Wired ports (Daikin S21, Panasonic CN-CNT, Mitsubishi CN105, Midea UART) read the real state back. | https://github.com/crankyoldgit/IRremoteESP8266/blob/master/SupportedProtocols.md ; https://github.com/crankyoldgit/IRremoteESP8266/tree/master/src |
| 9 | Steel-skinned insulated panels block radio. 5 GHz drops almost at once; 2.4 GHz gets through poorly. | Put the room node outside the room and run sensor cables in (RS485), or bring Ethernet out. Do not rely on Wi-Fi from inside the room. | https://www.dwyeromega.com/en-nl/resources/wireless-temperature-transmission-from-cold-rooms ; https://forum.mikrotik.com/t/solving-faraday-cage-signal-loss-in-a-steel-framed-modular-site-office/268880 |
| 10 | Node 22 support ends 2027-04-30; Node 24 is supported to 2028-04-30. `node:sqlite` is still "active development" in v22. | Plan the move to Node 24 with the hardware work. | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json ; https://nodejs.org/docs/latest-v22.x/api/sqlite.html |
| 11 | Electricity Regulations 1994, reg. 36(2): 10 mA RCD where "the floor is likely to be wet"; 30 mA where hand-held equipment is used. Wiring must be done by a registered wireman. | The panel needs a wireman; ask whether the fruiting room counts as a wet floor (10 mA). | https://www.st.gov.my/sites/default/files/2026-02/Electricity-Regulations-1994.pdf |

## 2. What the controller reads and drives, and the part for each

| Loop fact | Value | Code |
|---|---|---|
| Server tick | Every 1 s | `server/rooms.js` `tickMs` |
| Decision | Only on a new reading (new `seq`), one per sensor period, default 30 s | `runtime.js`, `docs/contract.md` 1 |
| Values | Raw; the controller applies offsets and the spike, range and frozen checks; 3 bad readings = sensor fault | `controller.js` `SENSORS`, `FAULT_COUNT` |
| Machine protection | Done by the controller; the adapter sends commands as they are | `docs/contract.md` 2 |
| State save | Controller and adapter snapshots every 300 s | `server/rooms.js` `STATE_SAVE_S` |

### 2.1 Readings

| Key | Unit, range (`SENSORS`) | Controller checks | Recommended part | Alternative | Notes |
|---|---|---|---|---|---|
| `seq`, `t`, `hour` | –, s, h | `t` must increase | Server clock (Pi 5 RTC with battery + NTP) | Node clock | `t` is epoch seconds today (`sim-adapter.js`: origin + sim t); `hour` local, `TZ_OFFSET_S` 28800 |
| `T`, `RH` | −10–60 °C; 1–100 % | Rate 2 °C/min, 15 %/min; frozen after 120 min (30 min for RH while fogging) | Vaisala HMP110, RS485 Modbus (±1.5 % RH to 90 %, ±2.5 % above; IP65) | Cytron industrial RS485 T/RH probe RM179 (±2 % RH) plus a salt test for `offsets.RH` | 100 % from a wet sensor is not "frozen" in the controller |
| `CO2` | 300–10000 ppm | Rise rate 1000 ppm/min; a fall during a purge is exempt; frozen after 60 min | Vaisala GMP252, RS485 Modbus (0–100 % RH, no ABC, ±40 ppm) | Seeed SenseCAP S-CO2-03 RS485 RM389 (0–95 % RH), ABC off | Response time T90 < 1 min: during a 1000 ppm/min purge the reading lags by several hundred ppm (calc, 3.2) |
| `tOut`, `rhOut` | −20–60 °C; 1–100 % | As T/RH | One farm-wide RS485 T/RH probe in a radiation shield (SenseCAP S-THP-01A or the Cytron probe) | HMP110 in the same shield | Shared by every room; the adapter copies it into each room's reading. A passive shield reads 2–3 °C high in sun with low wind |
| `core` (optional) | −10–70 °C | Rate 1 °C/min; frozen after 360 min | DS18B20 waterproof (RM8), cable entry resealed with adhesive heat shrink | PT1000 class A via a converter | Leave the key out when no probe is installed |
| `T2`, `RH2`, `CO2b` (optional) | as above | Pair disagreement: 1.5 °C, 6 % RH, 300 ppm | T2/RH2: Cytron SHT40 RS485 probe RM35–45 at the worst-mixed spot | Same model as the main set | Skip `CO2b` at first; one good CO₂ sensor plus the timed-purge fallback is enough |
| `power`, `kwh` (objects, summed into `power_w`, `kwh` by `buildReadingRow`) | W, kWh | Not used by the controller; stored and charted | PZEM-004T RS485 with 100 A CT on the AC circuit (RM65–69) | Eastron SDM120M Modbus meter for the whole room (EUR 32.76, EU price) | `sumFinite(null)` gives `null`, so a room without a meter can leave them out |

### 2.2 Commands

| Key | Values | Controller protection | Recommended part | Alternative | Power-loss and dead-node state (section 4) |
|---|---|---|---|---|---|
| `ac.power`, `ac.mode`, `ac.setpoint`, `ac.fan` | on/off; cool/heat/dry/fan; 16–30 °C in 0.5 °C steps; low/auto/high | `protect.acMinCmd` 2 min between AC commands | Wired port by brand (3.10): Daikin S21 (Faikout or ESPHome `daikin_s21`), Panasonic CN-CNT, Mitsubishi CN105, Midea UART | ESP32 IR LED (ESPHome `climate_ir`) or Broadlink RM4 mini, with the PZEM clamp and a supply-air probe as feedback | AC keeps its own thermostat; restarts in its last mode about 3 min after power returns on the brands checked |
| `hu.level` | 0–3 | `fogMinOn` / `fogMinOff` 1 min | Three equal ultrasonic units (about 1.35 L/h, 70 W each), one relay each: level n = n units on | Industrial ultrasonic with 0–10 V input (Carel humiSonic, Cumulus CU-3) | Off |
| `air.on` | true/false | Min on 30 s, min off `rules.minOffS` 60 s, purge cap 180 s | One relay: its normally-closed contact drives a contactor for both 315 mm fans; its normally-open contact powers both spring-return dampers closed | Industrial I/O module output with a vendor "safe value" | Dead node: fans on, dampers open (spring). Mains lost: fans off, dampers open |
| `lights.on` | true/false | None | Contactor (AC-1 20 A) from a node relay; no SSR | Finder 38.61 16 A interface relay | Off |
| `circ.on` | true/false | None | Node relay, normally-closed contact | Finder 38.51 interface relay | Dead node: on. Mains lost: off |

## 3. Findings by topic

### 3.1 Temperature and humidity sensors at 90–95 % RH

| Item | Finding | Number | Source |
|---|---|---|---|
| SHT4x normal range | Best performance range | 5–60 °C, 20–80 % RH | https://sensirion.com/resource/datasheet/sht4x |
| SHT4x high-RH offset | Reversible, recovers by itself | +3 % RH after 60 h at > 80 % RH | same |
| SHT4x accuracy | SHT40/41 typ.; SHT45 typ. at 25 °C; near 90–100 % read from the figures | ±1.8 / ±1.0 % RH; about ±2–3 (SHT40), ±1.5–1.75 (SHT45) | same |
| SHT4x drift | Typical | < 0.2 % RH/yr; < 0.03 °C/yr | same |
| SHT4x condensation | "Fully functional in a condensing environment"; no RH response while water is on it; the heater removes it | – | same |
| SHT4x heater | Power, pulse, duty; specs invalid while heating | 20/110/200 mW; 0.1 or 1 s; ≤ 10 % of lifetime | same |
| Creep fix | 200 mW, 1 s pulses; almost fully compensates the creep | ΔT about +50 °C per pulse | https://sensirion.com/media/documents/A88858C9/629626D4/Application_Note_Creep_Mitigation_SHT4x.pdf |
| SHT3x | Accuracy at 90 % RH; drift; heater only for plausibility checks | SHT31 ±2 % RH; < 0.25 % RH/yr; 3.6–33 mW | https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf |
| SF2 filter cap | PTFE membrane for SHT2x/3x/4x | IP67, 1.5 µm pores | https://sensirion.com/media/documents/356EC75F/61642475/Sensirion_Humidity_Sensors_SF2_Filter_Cap_Datasheet.pdf |
| Vaisala HMP110 | Accuracy 0–90 / 90–100 % RH; stability; housing; RS485 Modbus option | ±1.5 / ±2.5 % RH; ±2 % RH per 2 yr; IP65 | https://www.insatech.com/media/55qbnn40/gs_e_vaisala_hmp110-hmp110t-datasheet-b210852en.pdf ; https://www.vaisala.com/en/products/instruments-sensors-and-other-measurement-devices/instruments-industrial-measurements/hmp110 |
| Renke RS485 T/RH | Accuracy given only at 60 % RH; electronics rated ≤ 95 % RH non-condensing | ±2–3 % RH; ≤ 1 % RH/yr | https://www.renkeer.com/product/temperature-humidity-sensor/ |
| SenseCAP S-THP-01A | RS485 Modbus, Sensirion element | ±1.0 % RH, ±0.1 °C, IP56 | https://wiki.seeedstudio.com/RS485_Air_Temperature_Humidity_and_Barometric_Pressure_Sensor/ |
| Heater in cheap RS485 probes | Whether any runs an anti-creep heater | unverified | – |

### 3.2 CO₂ sensors

| Sensor | Accuracy | RH limit | Response | ABC | Interface | Source |
|---|---|---|---|---|---|---|
| Vaisala GMP252 | ±40 ppm (0–3000); ±60 ppm/yr | 0–100 %, heated head, IP65 | T90 < 1 min | None | RS485 Modbus, 4–20 mA, 0–10 V | https://docs.vaisala.com/api/khub/documents/pjpwllY92XNQFmUMgy9I8Q/content |
| Sensirion SCD30 (NDIR) | ±(30 ppm + 3 %) | 0–95 % non-condensing | τ63 20 s | ASC needs 400 ppm regularly; forced calibration available | I²C, UART Modbus | https://sensirion.com/media/documents/4EAF6AF8/61652C3C/Sensirion_CO2_Sensors_SCD30_Datasheet.pdf |
| Sensirion SCD41 (photoacoustic) | ±(50 ppm + 2.5 %) at 400–1000 | 0–95 % non-condensing | τ63 60 s | Assumes 400 ppm weekly | I²C | https://sensirion.com/media/documents/48C4B7FB/67FE0194/CD_DS_SCD4x_Datasheet_D1.pdf |
| Senseair S8 LP | ±40 ppm ±3 % | 0–85 % | ≤ 30 s (new page); 2 min (old datasheet) | 8 days, 30–50 ppm per period | UART Modbus | https://senseair.com/product/s8/ ; https://rmtplusstoragesenseair.blob.core.windows.net/docs/Dev/publicerat/PSH1944.pdf |
| Senseair K30 | ±30 ppm ±3 % | 0–95 % non-condensing | 20 s | ABC | UART, I²C | http://www.co2meters.com/Documentation/Manuals/Manual-SE-0118-K-30-10-pct-sensor.pdf |
| Senseair Sunrise | ±(30 ppm + 3 %) | 0–85 % | 30 s | ABC | I²C, UART | https://senseair.com/product/sunrise/ |
| MH-Z19C | ±(50 ppm + 5 %) | 0–95 % non-condensing | T90 < 120 s | Every 24 h; maker says not for greenhouses | UART, PWM | https://www.winsen-sensor.com/d/files/manual/mh-z19c.pdf |
| SenseCAP S-CO2-03 | ±(50 ppm + 3 %) | 0–95 % | – | Manual 400 ppm button; background ABC unverified | RS485, SDI-12 | https://files.seeedstudio.com/products/SenseCAP/101991029_CO2_Sensor/CO2_Sensor_Datasheet(S-CO2-03).pdf |
| DFRobot SEN0659 | ±50 ppm | 5–90 % | – | Manual | RS485, IP65 | https://wiki.dfrobot.com/SKU_SEN0659_RS485_Infrared_CO2_Sensor_400_5000ppm |

| Item | Finding | Number | Source |
|---|---|---|---|
| ABC in closed rooms | Senseair: turn ABC off in greenhouses and closed spaces; recalibrate every 2–3 years | – | https://senseair.com/the-senseair-abc-algorithm/ |
| ABC error in this room | Purges end near 600 ppm, so ABC would take 600 as 400: reads about 200 ppm low; at 30–50 ppm per 8 days that takes 1–2 months | about −200 ppm | calc |
| Lag in a purge | A first-order sensor reads high by about fall rate × time constant. At 1000 ppm/min: 20 s sensor about 333 ppm; GMP252 about 430 ppm; 60 s sensor about 1000 ppm | – | calc from the response times above |
| GMP252 humidity effect | Without RH compensation it reads +0.05 % of reading per % RH: about +37 ppm at 92 % RH and 800 ppm. Its default compensation setting is unverified | +37 ppm | calc from the GMP252 datasheet |
| Mushroom farms | Vaisala lists mushroom farms as a CO₂ use; an indoor farm uses HMP110 + GMP252 | – | https://www.vaisala.com/en/measurement/carbon-dioxide-co2-measurements ; https://www.vaisala.com/en/case/elevated-vertical-farming-using-vaisala-humidity-and-co2-measurements |
| Sampling outside the room | Commercial systems pump air from many rooms to one analyser outside (Fancom up to 16 rooms; DMP 8 or 18; Teracom 1 sensor per 2 rooms, outside the rooms). Sampled air warms in the corridor, so its RH falls below the sensor limit | – | https://www.fancom.com/system/mushroom-growing-phase ; https://umdis.org/vec-41-by-dmp-climate-computer-climate-control-in-mushroom-complexes-and-compost-production/ ; https://www.teracomsystems.com/blog/carbon-dioxide-control-in-mushroom-farms/ |
| MH-Z19 clones | Black-PCB clones reportedly read low | – | https://www.atomic14.com/esp32/sensors/co2-sensors/ |

### 3.3 Block probe and outdoor sensor

| Item | Finding | Number | Source |
|---|---|---|---|
| DS18B20 | Accuracy; conversion time | ±0.5 °C (−10…85 °C); 750 ms | https://www.analog.com/media/en/technical-documentation/data-sheets/DS18B20.pdf |
| DS18B20 clones | Common outside authorised sellers; some exceed ±0.5 °C | up to ±2 °C | https://github.com/cpetrich/counterfeit_DS18B20 ; https://www.olimex.com/Products/Components/Sensors/Temperature/SNS-TMP-DS18B20/ |
| "Waterproof" probe | Not IP rated; the cable-entry seal leaks after 1–3 months under water in user reports | – | https://www.adafruit.com/product/381 ; https://forum.arduino.cc/t/ds18b20-waterproof-sensor/1259925 |
| 1-Wire length | Users report reliable runs | 10–20 m easy | https://forums.raspberrypi.com/viewtopic.php?t=36163 |
| PT100/PT1000 | Class A tolerance; 2-wire lead error per 1 Ω | ±(0.15 + 0.002·abs(t)) °C; PT100 about 2.6 °C, PT1000 about 0.26 °C | https://www.tc.co.uk/thermocouple-and-rtd-guide/rtd-standards-and-tolerances.html ; https://www.ics-schneider.de/pt100-oder-pt1000-welcher-widerstandsthermometer-fuehler-passt-besser/?lang=en |
| Passive radiation shield | Error in sun with low wind | > 2 °C (wind < 2 m/s, sun > 700 W/m²) | https://www.researchgate.net/publication/255580296_Air_Temperature_Measurement_Errors_in_Naturally_Ventilated_Radiation_Shields |
| Passive vs aspirated | Mean daytime error | 0.39 °C vs about 0.2 °C | https://journals.ametsoc.org/view/journals/atot/30/3/jtech-d-12-00044_1.xml |

### 3.4 Sensor count and placement in a 60 m³ room

| Item | Finding | Source |
|---|---|---|
| One set | At crop height, shaded, hanging free with air moving (≥ 0.3 m/s), away from the AC and the humidifier | https://scienceinhydroponics.com/2021/03/properly-positioning-temperature-and-humidity-sensors-in-a-hydroponic-growing-environment.html |
| Mushroom rooms | At fruiting height among the bags, out of the humidifier plume, away from the door and the exhaust | https://zombiemyco.com/blogs/mushroom-teks/co2-meter-for-mushrooms-do-you-really-need-one |
| Commercial practice | A technologist maps the room before fixing sensor places | https://mushroom-climate.com/en/automated-environmental-control/ |
| Second set | At the worst-mixed spot; median control helps only with ≥ 5 sensors | https://scienceinhydroponics.com/2021/03/properly-positioning-temperature-and-humidity-sensors-in-a-hydroponic-growing-environment.html |
| Suggestion for 60 m³ | One main set mid-room at fruiting height, out of the fog, AC and intake jets; a cheap T2/RH2 probe at the worst-mixed spot; a block probe in one block; a supply-air probe at the AC outlet (for the AC check, not a controller reading) | unverified (judgement) |
| Distances from fogger, AC, intake | No source found | unverified |

### 3.5 Wiring distance

| Item | Finding | Number | Source |
|---|---|---|---|
| I²C | Bus capacitance limit | 400 pF | https://www.nxp.com/docs/en/user-guide/UM10204.pdf |
| I²C in practice | Twisted pair at 100 kHz (vendor blog) | about 8 m | https://industrialmonitordirect.com/blogs/knowledgebase/sizing-i2c-vs-spi-cable-length-distance-limits-bus-design |
| RS485 | Length; unit loads | 1200 m at 100 kbps; 32 loads | https://www.ti.com/lit/pdf/slla272 |
| Modbus RTU | 1000 m at 9600 baud; default 19200 baud even parity; 32 devices per segment | – | https://www.modbus.org/file/secure/modbusoverserial.pdf |
| Modbus timing | Reading 8 registers is about 33 ms at 9600 baud; 6 rooms take a few hundred ms of a 30 s period | – | calc |
| 4–20 mA | Robust over hundreds of metres; < 3.6 mA or > 21 mA means a fault (NE43) | – | https://www.fluke.com/en-us/learn/blog/calibration/what-is-a-4-20-ma-current-loop |
| Radio through panels | Steel-skinned cold-room walls block radio; 2.4 GHz leaks through joints poorly | – | https://www.dwyeromega.com/en-nl/resources/wireless-temperature-transmission-from-cold-rooms ; https://forum.mikrotik.com/t/solving-faraday-cage-signal-loss-in-a-steel-framed-modular-site-office/268880 |

### 3.6 Farm device

| Item | Finding | Number | Source |
|---|---|---|---|
| Raspberry Pi 5 8 GB | Cytron MY, board only | RM781.70 | https://my.cytron.io/p-raspberry-pi-5-with-8gb-ram |
| Pi 4 4 GB | Cytron MY | RM446.70 | https://my.cytron.io/p-raspberry-pi-4-model-b-4gb |
| Pi 27 W power supply | Pi 5 needs 5 V 5 A | RM53.60 | https://my.cytron.io/p-raspberry-pi-usb-c-power-delivery-27w-psu |
| M.2 HAT+ | NVMe 2230/2242 only | RM53.60 | https://my.cytron.io/p-raspberry-pi-md2-hat-plus-for-raspberry-pi-5 |
| Raspberry Pi SSD 256 GB | No endurance rating published | about US$75 street | https://www.pishop.us/product/raspberry-pi-nvme-ssd-256gb/ |
| Pi 5 RTC | Built in; the SC1163 cell keeps time through outages; charging is off by default | – | https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/rtc.adoc |
| Pi 5 idle power | Measured | 2.4–3.3 W | https://www.jeffgeerling.com/blog/2024/new-2gb-pi-5-has-33-smaller-die-30-idle-power-savings/ |
| Intel N100 mini PC | Malaysia, complete units; idle power | RM627–1,699; 6–12 W | https://my.biggo.com/s/Mini%20PC%20Beelink ; https://minilabhq.com/posts/n100-mini-pc-power-consumption/ |
| RevPi Connect 5 | CM5, 24 V, DIN rail, eMMC, −25 to 60 °C | €536 list | https://revolutionpi.com/en/ordering/overview-products-and-prices |
| Seeed EdgeBox-RPI-200 | CM4, hardware watchdog, isolated RS485, optional UPS | US$251.90–519.50; UPS version US$374 | https://www.seeedstudio.com/EdgeBox-RPi-200-CM4108032-p-5598.html |
| Node on arm64 | Linux arm64 is Tier 1 | – | https://github.com/nodejs/node/blob/main/BUILDING.md |
| Database writes | 6 rooms × 2880 rows/day + snapshots every 5 min: about 25–36 MB/day of WAL with one transaction per tick, at most about 0.3 GB/day with one commit per row | – | calc from https://www.sqlite.org/fileformat2.html |
| SD endurance | SanDisk High Endurance 64 GB: about 56 TB written; far above this load. Corruption at power loss is the real risk, not wear | about 56 TBW | https://goughlui.com/2020/01/15/quick-review-sandisk-high-endurance-video-64gb-microsdxc-card-sdsqqnr-064g-gn6ia/ |
| SQLite WAL | "WAL mode is safe from corruption with synchronous=NORMAL"; the last commits may roll back after power loss. FULL is durable | – | https://www.sqlite.org/pragma.html |
| Read-only root | The Pi overlay sends writes to RAM; the database needs its own writable partition | – | https://pip.raspberrypi.com/categories/685-whitepapers-app-notes/documents/RP-003610-WP/Making-a-more-resilient-file-system.pdf |

### 3.7 Room I/O node and its watchdog

| Item | Watchdog to a preset output state? | Number | Source |
|---|---|---|---|
| ESPHome script `mode: restart` | Yes, built from parts: each command restarts a script that, after `delay: 5min`, sets the safe state. `on_client_disconnected`, MQTT `on_disconnect` and `restore_mode` (state at boot) also exist | default `reboot_timeout` 15 min | https://esphome.io/components/script/ ; https://esphome.io/components/api/ ; https://esphome.io/components/switch/ |
| Waveshare ESP32-S3-Relay-6CH | Runs ESPHome; 6 relays, each with NO and NC exposed; isolated RS485; 7–36 V input; no RTC | 10 A 250 VAC per contact; US$28.99 | https://www.waveshare.com/wiki/ESP32-S3-Relay-6CH ; https://www.waveshare.com/esp32-s3-relay-6ch.htm ; https://devices.esphome.io/devices/waveshare-6ch-relay/ |
| Advantech ADAM-6000 (Modbus TCP) | Yes: "HostIdle" timeout, each output goes to its safe value | 5–4095 s; ADAM-6050-D1 US$246 | https://advdownload.advantech.com/productfile/Downloadfile1/1-2VCNDMU/ADAM-6000_6200%20RESTful%20User%20Manual_V1.0.pdf ; https://www.digikey.com/en/products/detail/advantech-corporation/ADAM-6050-D1/17748029 |
| Advantech ADAM-4000 (RS485) | Yes: stored safety value | ADAM-4068-C about US$208 | https://www.advantech.com/en-us/support/details/faq?id=1-1RND4O |
| Moxa ioLogik E1200 | Yes, off by default; must be enabled | E1214 about US$251–307 | https://moxa.com/getmedia/451bb28e-7e07-4bd7-b8e8-260e093ad73b/moxa-iologik-e1200-series-manual-v16.2.pdf |
| Waveshare Modbus RTU relay | No documented watchdog; only a "flash on" timer | about US$29–35 | https://www.waveshare.com/wiki/Modbus_RTU_Relay |
| Eletechsup N4D3E16-type | No watchdog found; "delay" mode up to 255 s | – | https://www.laskakit.cz/user/related_files/8ch_rele_rs485_protocols.pdf |
| Tasmota `PulseTime` | Turns a relay off after a time only; "fans on when silent" then needs the normally-closed contact | – | https://tasmota.github.io/docs/Commands/ |

### 3.8 Protocols between the room nodes and the Node server

| Option | Finding | Number | Source |
|---|---|---|---|
| ESPHome web server REST + `/events` | GET `/sensor/<id>`; POST `/switch/<id>/turn_on` or `turn_off`; Server-Sent Events at `/events` send all states on connect, then changes. Basic or digest auth. Needs only Node's built-in `fetch`: no npm dependency | – | https://esphome.io/web-api/ ; https://esphome.io/components/web_server/ |
| MQTT (`mqtt` npm) | Last Will tells each side when the other is gone; broker drops a silent client after 1.5 × keepalive | 2,715,137 downloads/week; v5.16.0 | https://registry.npmjs.org/mqtt/latest ; https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.pdf |
| Broker | Mosquitto, or `aedes` inside Node | aedes 123,053/week | https://mosquitto.org/man/mqtt-7.html ; https://api.npmjs.org/downloads/point/last-week/aedes |
| Modbus RTU / TCP (`modbus-serial`) | RTU and TCP; `serialport` optional | 63,118/week; v8.0.25 | https://registry.npmjs.org/modbus-serial/latest |
| `jsmodbus` | Alternative | 17,726/week | https://registry.npmjs.org/jsmodbus |
| ESPHome native API clients for Node | `esphome-client` (Node ≥ 22.20) and `@2colors/esphome-native-api`; few users | 887 and 1,122/week | https://github.com/hjdhjd/esphome-client |
| Repo today | `package.json` has no dependencies | – | `package.json` |

### 3.9 Driving the split AC by infrared

| Item | Finding | Number | Source |
|---|---|---|---|
| IRremoteESP8266 | Supports Daikin (many variants), Panasonic, Midea, Coolix, Mitsubishi, Gree, Sharp, York. Acson is not listed | – | https://github.com/crankyoldgit/IRremoteESP8266/blob/master/SupportedProtocols.md |
| Setpoint by protocol | Mitsubishi and Daikin (ARC433/466, DAIKIN312) take half degrees; Panasonic 16–30, Midea 17–30, Coolix 17–30, Gree 16–30 whole degrees; DAIKIN2/312 minimum cool setpoint 18 °C | – | https://raw.githubusercontent.com/crankyoldgit/IRremoteESP8266/master/src/ir_Mitsubishi.h ; https://raw.githubusercontent.com/crankyoldgit/IRremoteESP8266/master/src/ir_Daikin.h ; https://github.com/crankyoldgit/IRremoteESP8266/tree/master/src |
| Toggle bits | Midea swing/econo/turbo/light/clean, Coolix swing/turbo/clean, Panasonic AC32 power toggle: a resend flips them | – | same |
| ESPHome `climate_ir` | Without a receiver the state is "assumed from the latest command sent" | – | https://esphome.io/components/climate/climate_ir/ |
| Broadlink RM4 mini | Local control with `python-broadlink`; app "lock" must be off; Node: `node-broadlink` v2.4.1 | RM73–99 (Lazada) | https://github.com/mjg59/python-broadlink ; https://www.npmjs.com/package/node-broadlink ; https://www.lazada.com.my/products/broadlink-rm-mini-4-rm4-mini-smart-home-automation-ir-blaster-universal-remote-controller-i944098845.html |
| Broadlink offline for months | No source | unverified | – |
| Fog blocking the IR window | No source | unverified | – |

### 3.10 Wired AC links by brand

| Brand | Link | What it reads back | Price | Source |
|---|---|---|---|---|
| Daikin | S21 port: Faikout ESP32 board (local web/MQTT, no cloud) or ESPHome `daikin_s21` | Real mode/setpoint, return, outside and coil temperatures (0.1 °C), fan, compressor rate. Malaysian FTKU reported working; FTKF unverified | £33 board + £3 cable | https://codeberg.org/RevK/ESP32-Faikout ; https://github.com/FloHomi/ESP32-Faikin/blob/main/Manuals/S21.md ; https://lectronz.com/products/faikout-alternative-wifi-air-con-controller ; https://community.home-assistant.io/t/daikin-esp32-esphome-local-control/699209 |
| Panasonic | CN-CNT port: ESPHome `panasonic_ac` (ESP32 + 5 V level shifter) | Live state, inside/outside temperature, estimated power; a fork adds compressor and defrost state. Malaysian KH models unverified | unverified | https://github.com/DomiStyle/esphome-panasonic-ac ; https://github.com/duczz/ha-esphome-panasonic-ac |
| Mitsubishi Electric | CN105 port: ESPHome `mitsubishi_cn105` | Settings, room temperature, compressor Hz, defrost/standby sub-mode, input power. MSY-GN listed; MSY-GR/JP unverified | unverified | https://esphome.io/components/climate/mitsubishi_cn105/ ; https://github.com/echavet/MitsubishiCN105ESPHome ; https://serin-labs.com/compatibility.html |
| Midea | UART dongle: SLWF-01pro with ESPHome `midea` | Real state, optional outdoor temperature and power | US$9.99–13 | https://esphome.io/components/climate/midea/ ; https://smartlight.me/smart-home-devices/wifi-devices/wifi-dongle-air-conditioners-midea-idea-electrolux-for-home-assistant |
| Gree | UART, ESPHome external component; "sometimes need to send parameter change twice" | Real state | unverified | https://github.com/piotrva/esphome_gree_ac |
| Acson, York, Sharp | No wired option found; Acson is a Daikin subsidiary | – | unverified | https://en.wikipedia.org/wiki/Acson_Malaysia |
| Any of Daikin, Panasonic, Mitsubishi, Midea | Intesis Modbus RTU gateway: error code, thermostat-on, real setpoint registers | US$309–328 | https://controlsdepot.com/intesis-dk-ac-mbs-1.html ; https://www.hms-networks.com/docs/default-source/products/intesis/manuals-and-guides---manuals/user-manual-inmbsdai001i000.pdf ; https://us.rs-online.com/product/hms-industrial-networks/inmbsmit001i000/73832122/ |

### 3.11 Can a split hold 18–20 °C at 90 % RH?

| Item | Finding | Number | Source |
|---|---|---|---|
| Lowest setpoint | Daikin 16–32 °C; Panasonic 16–30 °C | 16 °C | http://panasonic.ae/en/manuals/KC9NKH-3.pdf |
| Rated indoor range | Panasonic min 16 °C db / 11 °C wb; some Daikin min 21 °C db / 15 °C wb; Daikin CTXU 18 °C and 80 % RH max | – | section 1, finding 1 |
| Other brands at high RH | AUX: do not cool for more than 4 h at ≥ 80 % RH (drip, mould) | 80 % | https://auxcool.com/wp-content/uploads/2024/10/3F3F3F3F3F-T121E-3F3F.pdf |
| Daikin freeze protection | Compressor slows below 2 °C coil; stops when coil < 0 °C for 180 s; 3 min restart wait | 0 °C / 180 s | https://cdn.daikincloud.io/PIM/Assets/Documents/SM-FTK(X)B_AXVJU%20RK(X)B_AXVJUv2.pdf |
| Daikin A5 anti-icing | Room − coil ≥ 10 °C and coil ≤ −1 °C for 5 min; repeated A5 shuts the unit down | −1 °C | https://www.manualslib.com/manual/1282310/Daikin-Ctxg09qvjuw.html?page=179 |
| Panasonic anti-freezing | Coil < 2 °C for 4 min stops the compressor; restart at 10 °C; error H99 | 2 °C | https://www.panasonicproclub.com/uploads/CZ/catalogues/rac/service-manual/CS-PW24KE_service%20manual_PHAAM0810057C2.pdf |
| Inverter part load | Turndown 30–40 %; below it the unit cycles. Daikin MY FTKF25C: 9,000 Btu/h, minimum 3,400 Btu/h | 30–40 % | https://www.acdirect.com/blog/oversized-inverter-heat-pump/ ; https://www.daikin.com.my/product/ftkf-series-r32/ |
| Oversizing | Short cycles; the coil needs 10–15 min to wet out | – | https://www.acdirect.com/blog/inverter-ac-humidity-control/ |
| Grower reports | "Humidity and spores and mini splits don't mix". No tropical report of a split holding 18 °C found | – | https://www.shroomery.org/forums/showflat.php/Number/24261074/fpart/all/vc/1 |
| Low-temperature split | Panasonic PACi Elite cools to 8 °C; Malaysian price unverified | 8 °C | https://www.aircon.panasonic.eu/GB_en/happening/panasonic-paci-elite-can-cool-rooms-down-to-8-c/ |
| CoolBot | Tricks a split down to 1–15 °C; Panasonic reported incompatible | US$374 | https://homedepot.com/p/CoolBot-Generation-6-Walk-In-Cooler-Controller-with-Air-Conditioner-Control-from-59-F-to-34-F-CB-G6/302838021 ; https://www.leonthemilkman.com/wp-content/uploads/CoolBot-Compatibility.pdf |
| Cold room (condensing unit + evaporator) | Malaysian small cold room installed | RM18k–35k | https://www.mudah.my/supply-install-cold-room-chiller-room-79270836.htm ; https://www.hy-refrigeration.com/latestnews/nid/193501/ |

### 3.12 Confirming the AC obeyed

| Signal | Detects | Number | Source |
|---|---|---|---|
| Wired read-back | Real power, mode and setpoint; error codes; thermostat-on; coil temperature; right state after a power cut | – | section 3.10 |
| Iced coil (wired) | S21 coil ≤ −1 °C with room − coil ≥ 10 °C (Daikin A5 rule); CN105 defrost/standby sub-mode | −1 °C | https://www.manualslib.com/manual/1282310/Daikin-Ctxg09qvjuw.html?page=179 |
| PZEM-004T clamp on the AC circuit | Compressor running and its power; not the setpoint | RM65–69 (Cytron) | https://esphome.io/components/sensor/pzemac/ ; https://my.cytron.io/p-pzem-current-and-voltage-reader |
| Shelly Pro EM-50 | Same, with local Modbus TCP/MQTT | US$108 | https://us.shelly.com/products/shelly-pro-em-50 |
| Supply-air probe at the indoor outlet | Air temperature drop across the coil; normal is about 8–11 °C; a small drop means weak cooling | 8–11 °C | https://inspectapedia.com/aircond/Air_Conditioner_Temperatures.php |
| IR only | No feedback; confirm with power and supply air | – | https://community.home-assistant.io/t/how-to-get-the-correct-state-of-an-ac-unit/98812 |

### 3.13 AC restart after a power cut

| Brand | Behaviour | Source |
|---|---|---|
| Panasonic (Malaysia) | Resumes the last setting, 3–5 min delay; cannot be turned off | https://papamy.panasonic.com.my/papamy/faq.asp |
| Daikin | Resumes the same mode after 3 min; also stops on large voltage swings and restarts | https://www.manualslib.com/manual/1128294/Daikin-Ft25cv1a.html?page=39 ; https://www.daikin.com.my/service/troubleshooting/ |
| Mitsubishi MSY | Resumes the last mode | https://www.manualslib.com/manual/2468730/Mitsubishi-Electric-Mr-Slim-Msy-Gn18vf.html?page=6 |
| Acson | Jumper, fitted at the factory | https://www.manualslib.com/manual/877752/Acson-A5wm.html?page=18 |
| York (SEA) | Has auto-restart | https://www.york.com/en_sg/-/media/project/jci-global/york-sites/singapore-york/pdfs/r-grac_sea_iom_-_ec_york_-_complete_-_20221008.pdf |
| Midea, Sharp | Some models only | https://www.midea.com/content/dam/midea-aem/us/air-conditioners/split-system/manuals/AC-Split-Owner-s-Manual.pdf ; https://sg.sharp/sites/default/files/products/documents/OM_TINSEA845JBRZ_0117.pdf |

### 3.14 Foggers

| Item | Finding | Number | Source |
|---|---|---|---|
| Sureserv 13 L industrial ultrasonic | 1350 ml/h, 70 W (Malaysia) | RM339 | https://www.sureserv.com.my/products/13l-industrial-ultrasonic-humidifier-disinfectant-fogging-machine-intelligent-basic-version |
| HardwareMISE | 1350 ml/h, out of stock | RM266 | https://hardwaremise.com.my/humidifier-disinfectant-machine-industrial-misting-disinfection-fogger-ultrasonic-fog-sprayer-malaysia-supplier |
| Single 20 mm disc | Output, power | 500 ml/h, 22 W | https://thehouseofhydro.com/products/1-disc-mist-maker-with-float-and-spare-discs |
| 10-head disc (VEVOR) | Output, power | 7 L/h, 280 W | https://www.vevor.com/ultrasonic-mist-maker-c_10257/vevor-10-head-ultrasonic-mist-maker-7000ml-h-ultrasonic-fogger-ip67-waterproof-p_010807693310 |
| Carel humiSonic direct | 0–10 V / 4–20 mA / Modbus input; demineralised water only; 10,000 h transducer warranty with it | 2–8 kg/h, < 80 W per kg/h | https://www.carel.com/documents/10191/0/+3000103EN/82a4dcba-c96a-4891-92ff-70c672b15eef?version=1.1 |
| Cumulus CU-3 | 0–10 V or 4–20 mA input | 3 kg/h | https://www.cumulusluftbefeuchtungstechnik.de/wp-content/uploads/2016/09/Datasheet-Ultrasonic-Humidifiers.pdf |
| Centrifugal (Ravi CentriFog) | Output, power | 7 L/h, 70 W | https://www.humiditysolution.in/industrial-humidifier.html |
| 70 bar misting | One 0.15 mm nozzle gives about 2.8 L/h; pump 1 HP, 7.1 A; growers report soaked bags | – | https://www.mistec-group.com/2023/11/10/misting-nozzles-selecting-the-right-size-for-optimal-performance/ ; https://fogco.com/product/pulley-drive-mist-pump-1-lpm-1-hp-230v-7-1-fla-770-rpm/ ; https://www.shroomery.org/forums/showflat.php/Number/25227761 |
| White dust | Minerals in the water; distilled best, then RO/DI, then tap | RO removes 90–95 % | https://alliancechemical.com/blogs/articles/what-water-to-use-in-a-humidifier-distilled-deionized-tap-white-dust |
| Disc life | Seller ratings | 3000–5000 h | https://www.icstation.com/113khz-16mm-ultrasonic-mist-maker-fogger-atomizer-transducer-ceramic-discs-humidifier-replacement-parts-p-11432.html |
| Generic unit after mains is switched | Whether it resumes running | unverified: bench-test before buying | – |

### 3.15 Fans for the air exchange (SF-203, EF-206)

| Item | Finding | Number | Source |
|---|---|---|---|
| Vents TT PRO 250 | AC 2-speed, at 0 Pa | 1110/1400 m³/h, 125/177 W | https://ventilation-system.com/product/tt-pro-250/ |
| Vents TT PRO 315 | AC 2-speed, at 0 Pa, IPX4 | 1570/2050 m³/h, 230/320 W, 1.0/1.42 A | https://ventilation-system.com/product/tt-pro-315/ |
| Systemair K 315 L | Flow falls under pressure | 1728 m³/h at 0 Pa; about 780 m³/h at 437 Pa | https://manuals.plus/m/9a04d0f8aefccbd598aef20281061cc8efe619e7cd055f0c0f62c01e62d08991 |
| AC Infinity Cloudline PRO T10 | EC motor, PWM speed | about 2040 m³/h, 255 W, US$299; eBay MY RM1,213.58 + RM353.77 shipping | https://acinfinity.com/cloudline-t10-quiet-inline-fan-10-with-temperature-humidity-vpd-controller/ ; https://www.ebay.com.my/b/Inline-Duct-Fan/178985/bn_7023255449 |
| EC fans | ebm-papst: don't cycle EC fans at the mains; use the control input | – | https://img.ebmpapst.com/products/manuals/W1G200EC9127-BA-ENU.pdf |
| AC motor start | 5–8 × running current | – | https://industrialmonitordirect.com/blogs/knowledgebase/troubleshooting-single-phase-capacitor-run-motor-locked-rotor |
| Shopee mixed-flow (BSBOSS IMF) | 4–8 inch only (too small) | RM102.30–206.10 | https://shopee.com.my/In-Line-Duct-Fan-4-6-8-inch-Fresh-Air-Fan-and-Exhaust-Ventilation-Fan.-IMF-Mixed-flow-Ducting-HVAC-booster-extractor-i.356565853.6884962590 |
| Local makers | Kruger MTD, GTG MIXX: quote only | – | https://www.krugerfan.com/products/view/6/25 ; https://www.gtg.com.my/product/high-efficiency-mixed-flow-in-line-fan/ |
| Fan curve at 0–100 Pa | Not found | unverified | – |

### 3.16 Dampers

| Item | Finding | Number | Source |
|---|---|---|---|
| Spring return | Powered one way; the spring drives it to a fixed position on power loss | – | https://content.greenheck.com/public/DAMProd/Original/10002/How_to_select_an_actuator_otherinfo.pdf |
| 3-wire open/close | Stays where it was on power loss: not fail-safe | – | https://www.belimo.com/mam/americas/technical_documents/Support%20material/belimo_wiring_guide_en-us.pdf |
| Belimo LF230 | On/off spring return; motor 75 s, spring < 20–25 s | 4 Nm, 100–240 V AC, 2 W holding; US$321.45 (Belimo MY shop) | https://www.belimo.com/mam/general-documents/datasheets/en-gb/belimo_LF230_datasheet_en-gb.pdf ; https://www.belimo.com/my/shop/en_GB/Actuators/Fail-Safe-Actuators/LF230/p?code=LF230 |
| Belimo TF230 | Fail direction set by mounting side | 2.5 Nm, 1.5 W holding | https://www.belimo.com/mam/general-documents/datasheets/en-gb/belimo_TF230_datasheet_en-gb.pdf |
| Plastic-XC motorised damper | Spring return optional | US$19 | https://plastic-xc.com/product/electric-motorized-damper/ |
| Cheap damper in RM | Not found | unverified | – |

### 3.17 Relays, SSRs and contactors

| Item | Finding | Number | Source |
|---|---|---|---|
| Songle SRD-05VDC (cheap "10 A" modules) | Changeover rating at 240 V | 7 A resistive | https://www.handsontec.com/dataspecs/relay/SRD-05VDC-SL-C.pdf |
| Derating | Motors: 1/5–1/6 of the resistive rating | – | https://ozuno.com/blog/understanding-relay-ratings/ |
| Finder 38.51 / 38.61 | 6 A (AC15 300 VA, motor 0.185 kW) / 16 A (30 A peak) | RM87.68 (38.51, element14 MY) | https://cdn.findernet.com/app/uploads/S38EN.pdf ; https://my.element14.com/finder/38-51-7-024-0050/relay-spdt-250vac-6a/dp/1169347 |
| LS MC-9b contactor | AC-1 20 A, AC-3 9 A | RM25.30–60 | https://edaran.my/product/1109/lselectric-ls-metalsol-mc-contactor-9b-12b-18b-22b-32a-and-40a ; https://www.samajaya.com.my/showproducts/productid/5325869/ls-mc9b-mc-9b-mc9b-3-pole-240v-contactor/ |
| Fotek SSR-25DA off-state leakage | Makes LEDs glow; fakes hold a 10–12 A triac | 3 mA | http://www.fotek.com.hk/solid/SSR-1.htm ; https://protosupplies.com/inferior-counterfeit-fotek-ssr-25-solid-state-relays-on-the-market/ |
| Zero-cross SSR on a transformer | Inrush in TE's test | about 200 A first half-cycle | https://www.te.com/en/products/relays-and-contactors/electromechanical-relays/intersection/zero-crossover-switching-transformers.html |
| LED driver inrush (Mean Well HLG-100H) | Cold start | 60 A for 415 µs | https://www.meanwell.co.uk/assets/pdf/HLG-100H-spec.pdf |

### 3.18 Failure safety and UPS

| Layer | Finding | Number | Source |
|---|---|---|---|
| Pi hardware watchdog | Max timeout 15 s; `RuntimeWatchdogSec=14` in systemd | 15 s | https://forums.raspberrypi.com/viewtopic.php?t=353094 |
| systemd service | `WatchdogSec=` with `NotifyAccess=all`; set `Restart=always` (default is no) | – | https://man7.org/linux/man-pages/man5/systemd.service.5.html |
| Room node | ESPHome restarting script: no command for 5 min, then the safe state | – | https://esphome.io/components/script/ |
| Relay wiring | A dead node de-energises all relays, so the wiring decides the state (section 4) | – | design |
| Blackout | Fans run on mains; during a mains outage there is no air exchange whatever the controller does | – | inference |
| 650 VA UPS | Prolink PRO700SFC, 140–300 V input, 2–6 ms transfer | RM159 | https://www.superbuy.my/shop/prolink-650va-ups-power-backup-battery-with-avr-for-computer-modem-router-network-equipment-cctv-pro700sfc/p/446821 |
| APC BV650I-MS | – | RM180–319 | https://www.superbuy.my/shop/apc-easy-ups-bv-650va-avr-universal-outlet-230v-bv650i-ms/p/420408 |
| Pi UPS HAT | Waveshare UPS HAT (B), 2 × 18650 | RM136.60 with cells | https://my.cytron.io/p-ups-hat-for-raspberry-pi-5v-5a-output-with-18650-li-ion-batteries |
| DC UPS | Mean Well DRC-60A/B with mains-OK and battery-low contacts; RM price unverified | – | https://www.meanwellaustralia.com.au/products/DRC-60 |
| Outages | Peninsular customers average about 47 min a year | 46.1–47.9 min | https://www.tnb.com.my/assets/annual_report/TNB_IAR_2024.pdf |
| Telegram alarms | About 1 message per second per chat; needs internet | – | https://core.telegram.org/bots/faq |
| SMS | 3G shut down 2021; CelcomDigi has no plan to shut 2G; a 4G modem with 2G fallback (SIM7600) | US$98.99 | https://www.komunikasi.gov.my/en/public/news/20247-3g-network-to-be-shut-down-by-end-of-the-year ; https://help.celcomdigi.com/en/support/solutions/articles/70000660246-what-i-need-to-know-about-3g-network-sunset- ; https://www.waveshare.com/sim7600e-h-4g-hat.htm |

### 3.19 Malaysian rules and supply

| Item | Finding | Source |
|---|---|---|
| Wiring | Reg. 12: a wireman (single-phase restriction or higher) supervises and certifies; employed by an electrical contractor | https://www.st.gov.my/sites/default/files/2026-02/Electricity-Regulations-1994.pdf |
| RCD | Reg. 36: 10 mA wet floors; 30 mA hand-held equipment; 100 mA otherwise | same |
| Agricultural premises | ST points to IEC 60364-7-705 (UK §705: min IP44, 30 mA on sockets, 300 mA fire RCD) | https://www.st.gov.my/sites/default/files/2026-02/02--IEM-EC---Electrical-Safety-Seminar.pdf ; https://www.elec-mate.com/agricultural-electrical-installation |
| Certificate of approval | Reg. 97: regulated equipment sold to the public needs Energy Commission approval. The list includes plugs, sockets, switches, RCD/MCB, LED lighting, control gear, fans, ACs ≤ 32,000 Btu/h, cable; not contactors, relays or DIN supplies. A humidifier falls under "fan" | https://www.st.gov.my/stakeholders/electricity/appliances/list-regulated-electrical-equipment ; https://asean.org/wp-content/uploads/2024/03/Regulatory-Regime-of-Malayia-Update-List_September-2023.pdf |
| Plug-in control box as "installation wiring" | Not found | unverified: ask ST or a contractor |
| AC circuit | Own circuit, 20 A double-pole switch | http://epsmg.jkr.gov.my/images/1/11/Residential-Wiring-ST.pdf |
| Voltage | 230 V +10 % / −6 %, 50 Hz ±1 % | https://www.tnb.com.my/assets/files/2022_ESAH_3.1.pdf |
| Lightning | 180–260 thunderstorm days a year | https://f1000research.com/articles/10-921/v2 |
| Surge protection | ST guideline encourages an SPD at the incoming supply; ≤ 2.5 kV protection level | http://epsmg.jkr.gov.my/images/1/11/Residential-Wiring-ST.pdf ; http://epsmg.jkr.gov.my/images/a/a3/2._Kursus_SPD_2020_.pdf |
| IP65 enclosure in a 90 % room | No rule found; a membrane vent does not dry a box; add a drain at the lowest point | https://www.budind.com/breathable-ip-rated-vents/ |

## 4. Recommended wiring per load

| Load | Node relay | Contact used | Server dead (node alive, after 5 min) | Node dead (mains on) | Mains lost |
|---|---|---|---|---|---|
| Fan pair SF-203 + EF-206 | R1 | Normally closed → contactor coil (LS MC-9b), both fans on its poles | Node program: timed purge (suggested, Q1) | On | Off |
| Dampers (2 × spring return) | R1 | Normally open → powers both dampers closed | Follows R1 | Open (spring) | Open (spring) |
| Fogger unit 1, 2, 3 | R2, R3, R4 | Normally open | Off | Off | Off |
| Circulation fan | R5 | Normally closed | On | On | Off |
| Lights | R6 | Normally open → contactor coil | Off | Off | Off |
| Split AC | – (wired port or IR from the node) | Own 20 A circuit with double-pole switch | Keeps last setpoint on its own thermostat | Keeps last setpoint | Off; restarts in its last mode about 3 min after power returns |

## 5. Bill of materials for one 60 m³ room

| # | Item | Recommended part | Qty | Price each | Budget alternative | Source |
|---|---|---|---|---|---|---|
| 1 | Main T/RH | Vaisala HMP110, RS485 | 1 | US$512 (Seacom MY: quote only) | Cytron industrial RS485 T/RH, RM179 | https://www.fondriest.com/vaisala-hmp110-humidity-and-temperature-sensor.htm ; https://seacom.com.my/humidity-transmitter/229-vaisala-hmp110-high-accuracy-humidity-and-temperature-probe.html ; https://my.cytron.io/c-temperature-humidity-sensor/p-industrial-grade-rs485-temperature-humidity-sensor |
| 2 | Main CO₂ | Vaisala GMP252, RS485 | 1 | from US$1,004 (Seacom MY: quote only) | SenseCAP S-CO2-03 RS485, RM389 | https://www.fondriest.com/vaisala-gmp252-carbon-dioxide-probe.htm ; https://seacom.com.my/co2-meter-transmitter/148-vaisala-gmp252-ppm-level-co-probe.html ; https://my.cytron.io/p-sensecap-co2-temperature-and-humidity-sensor-with-rs485-and-sdi-12 |
| 3 | T2/RH2 | Cytron SHT40 RS485 probe | 1 | RM45 | same | https://my.cytron.io/p-sht40-rs485-temperature-and-humidity-sensor |
| 4 | Block probe and AC supply-air probe | DS18B20 waterproof | 2 | RM8 | same | https://my.cytron.io/c-temperature-humidity-sensor/p-temperature-sensor-waterproof |
| 5 | AC power check | PZEM-004T with 100 A CT | 1 | RM69 | same | https://my.cytron.io/p-pzem-current-and-voltage-reader |
| 6 | Room node | Waveshare ESP32-S3-Relay-6CH (ESPHome) | 1 | US$28.99 (RM unverified) | same | https://www.waveshare.com/esp32-s3-relay-6ch.htm |
| 7 | AC link | Wired adapter for the AC brand (Faikout £33 + £3; SLWF-01pro US$13; others unverified) | 1 | see 3.10 | IR LED on the node, or Broadlink RM4 mini RM93.90 | section 3.10 ; https://www.lazada.com.my/products/broadlink-rm-mini-4-rm4-mini-smart-home-automation-ir-blaster-universal-remote-controller-i944098845.html |
| 8 | Intake and exhaust fans | Vents TT PRO 315 (2050 m³/h at 0 Pa) | 2 | RM unverified (quote) | AC Infinity T10, RM1,213.58 + RM353.77 shipping (eBay MY) | https://ventilation-system.com/product/tt-pro-315/ ; https://www.ebay.com.my/b/Inline-Duct-Fan/178985/bn_7023255449 |
| 9 | Damper actuators | Belimo LF230 spring return | 2 | US$321.45 | Plastic-XC damper with spring return, US$19 (quality unverified) | https://www.belimo.com/my/shop/en_GB/Actuators/Fail-Safe-Actuators/LF230/p?code=LF230 ; https://plastic-xc.com/product/electric-motorized-damper/ |
| 10 | 315 mm damper bodies, ducts, intake filter | Local HVAC supplier | 1 lot | unverified | – | – |
| 11 | Contactors (fan pair, lights) | LS MC-9b | 2 | RM60 | same | https://www.samajaya.com.my/showproducts/productid/5325869/ls-mc9b-mc-9b-mc9b-3-pole-240v-contactor/ |
| 12 | Fogger | 1350 ml/h ultrasonic, 70 W (Sureserv) | 3 | RM339 | same | https://www.sureserv.com.my/products/13l-industrial-ultrasonic-humidifier-disinfectant-fogging-machine-intelligent-basic-version |
| 13 | Panel enclosure | IP65 ABS, 263 × 182 × 95 mm | 1 | RM41 | same | https://my.cytron.io/p-outdoor-ip65-water-proof-enclosure-with-abs-plate |
| 14 | 24 V DIN supply (node, sensors) | Mean Well EDR-75-24 | 1 | RM96.05 | same | https://www.digikey.my/en/products/detail/mean-well-usa-inc/EDR-75-24/7702918 |
| 15 | RCCB | EPS 2P 40 A 30 mA (10 mA if the wireman says wet floor; not found) | 1 | RM45 | same | https://edaran.my/product/149/eps-eps-40a-2-pole-30ma-and-100ma-elcb-rccb-sirim-approve- |
| 16 | Fogger water | RO or DI water supply | 1 | unverified | – | – |
| 17 | Wiring, glands, MCBs, labour (wireman) | – | 1 lot | unverified | – | – |

| Subtotal | Recommended | Budget |
|---|---|---|
| RM lines (3, 4, 5, 11, 12, 13, 14, 15; budget adds 1 and 2) | RM1,449.05 | RM2,017.05 |
| USD lines (1, 2, 6, 9; budget keeps 6 and 9) | US$2,187.89 | US$671.89 |
| Not priced | 7, 8, 10, 16, 17 | 7, 8, 10, 16, 17 |
| The AC itself | Not in this list: sized by C8; Malaysian prices in `2026-10-08-lionsmane-equipment-raw-findings.json` (e.g. Daikin FTKF 2.0 HP inverter RM2,999) | same |

### 5.1 Farm-wide items (shared by all rooms)

| Item | Part | Price | Source |
|---|---|---|---|
| Farm device | Raspberry Pi 5 8 GB | RM781.70 | https://my.cytron.io/p-raspberry-pi-5-with-8gb-ram |
| Power supply | Pi 27 W | RM53.60 | https://my.cytron.io/p-raspberry-pi-usb-c-power-delivery-27w-psu |
| Storage | M.2 HAT+ with NVMe SSD 256 GB | RM53.60 + about US$75 | https://my.cytron.io/p-raspberry-pi-md2-hat-plus-for-raspberry-pi-5 ; https://www.pishop.us/product/raspberry-pi-nvme-ssd-256gb/ |
| Clock | RTC cell SC1163 | unverified | https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/rtc.adoc |
| UPS | Prolink PRO700SFC 650 VA, for the Pi, switch, router and room-node supplies; not the AC, fogger or fans | RM159 | https://www.superbuy.my/shop/prolink-650va-ups-power-backup-battery-with-avr-for-computer-modem-router-network-equipment-cctv-pro700sfc/p/446821 |
| Outdoor T/RH | Cytron industrial RS485 T/RH in a radiation shield (shield price unverified) | RM179 | https://my.cytron.io/c-temperature-humidity-sensor/p-industrial-grade-rs485-temperature-humidity-sensor |
| Network | Switch, wired Ethernet or a 2.4 GHz access point outside each room | unverified | – |
| SMS fallback (optional) | SIM7600 4G modem | US$98.99 | https://www.waveshare.com/sim7600e-h-4g-hat.htm |
| Subtotal (priced) | | RM1,226.90 + US$75 | |

## 6. Open questions for the owner

| # | Question | Why it matters | Options |
|---|---|---|---|
| Q1 | When the server dies, should the air exchange run continuously (the contract's proposal) or as a timed purge (for example 3 min every 30 min) from the node? | Continuous 1800 m³/h of 33 °C air is about 18 kW (calc), about 3 times a 2.5 HP split: the room warms and the coil floods in hours | Timed purge in the node (suggested); continuous; off |
| Q2 | When the room node itself dies (mains still on), fans on or off? | With the normally-closed wiring, fans run continuously (same load as Q1). With normally-open wiring, they stop and CO₂ rises | Fans on (CO₂ safe, heat risk); fans off (heat safe, CO₂ risk) |
| Q3 | Dampers on power loss: open or closed? | Open lets unfiltered air leak in during a blackout; closed traps CO₂ | Spring open (suggested with the fans); spring closed |
| Q4 | Which AC brand and model are in, or planned for, the rooms? | Decides wired link vs IR, the setpoint step (0.5 °C or 1 °C) and the lowest setpoint (16 or 17 °C) | Daikin, Panasonic, Mitsubishi or Midea give read-back; others IR only |
| Q5 | Trial one room at 18–20 °C and 90 % RH before buying ACs for all? | Splits are rated to 80 % RH indoor; some Daikin only from 21 °C indoor; freeze protection may stop the compressor | Trial a split; low-temperature unit (Panasonic PACi Elite); cold-room condensing unit (RM18k–35k) |
| Q6 | Sensor grade: Vaisala (about US$1,516 per room) or budget (about RM568 per room)? | Only Vaisala parts are rated for 90–100 % RH; budget parts read high (RH creep) and may fail in condensation | Vaisala; budget with a monthly salt test; CO₂ sampled outside the room by a pump |
| Q7 | Fogger: three small ultrasonic units, an industrial unit with 0–10 V input, or high-pressure misting? | Three units match the controller's 0–3 levels with relays; an analog unit gives smooth output; misting soaks bags | Three units (suggested); Carel/Cumulus; misting |
| Q8 | Is RO or DI water available for the foggers? | Tap water gives white dust and shortens transducer life; Carel's warranty needs demineralised water | RO unit; bought DI water |
| Q9 | Who wires the panels, and does the fruiting room count as a wet floor (10 mA RCD)? | Regulation 12 and 36 | Registered wireman decides |
| Q10 | Is there internet at the farm? | Telegram alarms need it; otherwise SMS by a 4G modem | Internet + UPS on the router; SMS |
| Q11 | How many rooms on one farm device, and how far from the panel? | RS485 handles 1000 m; Wi-Fi does not pass steel panels | One node per room outside its door, Ethernet or RS485 back |
| Q12 | May the hardware adapter add an npm dependency? | MQTT and Modbus need packages; ESPHome's REST + `/events` needs none | No dependency (ESPHome REST/SSE, suggested); `mqtt`; `modbus-serial` |
| Q13 | Move from Node 22 to Node 24 with this work? | Node 22 support ends 2027-04-30 | Now; later |
| Q14 | What lights (driver, watts)? | LED driver inrush (60 A for a 100 W Mean Well) decides contactor vs relay | Datasheet of the chosen light |

## 7. Shape of the hardware adapter (suggestion for the future spec)

| Item | Today (simulation) | Suggestion for a hardware adapter |
|---|---|---|
| Factory | `defaultAdapterFactory` in `server/rooms.js` creates `createSimAdapter(args)` when `room.adapter === 'sim'`, else throws | Add `room.adapter === 'hw'` (`db.md` already names `hw`; the column has no CHECK). Same args: `{ room, calib, blocks, cfg, snapshot, now }` |
| Per-room hardware settings | None | New: node address and credentials, sensor map (Modbus addresses of T/RH, CO₂, T2/RH2, probe, meter), relay map (R1–R6), AC link (`wired:daikin_s21`, `ir:coolix`, …), AC setpoint step and minimum. Where it is stored (room row, settings or a new table) is for the spec |
| `io.read()` | Synchronous; returns the last reading with `seq` | Keep it synchronous. Network I/O runs in the background and fills a cache; `read()` returns the cache. Advance `seq` on a fixed 30 s timer, not on arrival, so a dead sensor bus gives `null` values (controller sensor fault and its own safe loops) instead of silence |
| Stale values | Not needed | A value older than about 2 periods is sent as `null` (not installed: key left out). This is "no value", not filtering, so it keeps the contract rule "do not filter, average or correct" |
| `t`, `hour` | `t` = origin + sim time (epoch s); `hour` from `TZ_OFFSET_S` 28800 | `t` = `now()` epoch seconds; `hour` from local time. Needs the RTC and NTP |
| `tOut`, `rhOut` | Simulated weather | One farm-wide outdoor sensor, copied into every room's reading |
| `power`, `kwh` | Simulated per machine, summed by `buildReadingRow` | From the PZEM or SDM meter, e.g. `{ ac: W }`; leave out when there is no meter (`sumFinite(null)` is `null`) |
| `io.write(cmd)` | Stores the command for `advance` | Called once per reading (every 30 s). Send every call to the node: it is also the node's heartbeat for the 5 min watchdog. Relays: send the state. AC wired: compare with the read-back and send on difference. AC IR: send on change and every 10 min, full-state codes only. Round the setpoint to the AC's step |
| `io.advance` | Moves the simulation | Leave it out. `tickRoom` then only polls (the `else` branch) |
| `snapshot()` | Simulation state, saved in `controller_state.sim` every 300 s | Return `null` (the column accepts `NULL`) or a small object with the last AC read-back |
| `view()` | Plant view for the test bench | Optional: measured states (AC read-back, fan and AC power, supply-air temperature) for the room drawing |
| Write confirmation | None | New readings for the spec to consider: `acActual` (read-back or inferred from power), `acSupply` (°C), node `online`. The controller reads only its `SENSORS` keys, so extra keys do not disturb it |
| Fail-safe | In the contract only | In the node firmware (ESPHome restarting script) and the relay wiring of section 4; the server side adds systemd `Restart=always`, a service watchdog and the Pi hardware watchdog |
| Errors | `crashRoom` on a thrown error | A lost node or a failed send must not throw from `read()` or `write()`; report it as `null` values and an alarm, so one room's network fault does not crash its loop |
| Tests | Simulation | A fake node (HTTP + SSE server in the test) so the adapter is tested without hardware |

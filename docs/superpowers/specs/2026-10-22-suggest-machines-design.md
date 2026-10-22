# Suggest machines (iteration 10)

Date: 2026-10-22 · Branch `v2` · Builds on iteration 8 (simulation runs) and 9 (dehumidifier).

The owner asked (2026-10-22) whether the machine settings can be worked out by the program, as the lead did by hand for Container Alpha (a 150 m³/h fan, a 0.5 L/h humidifier and a 10–20 L/day dehumidifier took temperature, humidity and CO₂ each above 95 % in band), and said yes to building it. The lead chose every default (*default*).

## 1. Scope

| In | Out (later) |
|---|---|
| Starting estimates from formulas (fan, humidifier, dehumidifier, aircon, air exchange time limit) | Wall insulation, block count or band changes as suggestions (named in the notes only) |
| A background search with the simulation around them, ranked by energy among the setups that reach the target | Prices of the machines, payback |
| A **Suggest machines** action in the Simulate stepper: a table, **Use this** fills the stepper | Saving suggestions (they live until the farm app restarts) |
| A simulation run may carry an air exchange time limit of its own (the suggestion's), shown on its page | Changing the room's live settings from the suggestion (the page links to the room's Automatic control card) |

## 2. Inputs

`POST /api/rooms/:id/sizing` with `{ physics: { wallUA, outdoorHigh, outdoorLow, outdoorDew, sunW }, crops, farmType, stage, target }` — the stepper's walls, weather and sun (the machines are what it looks for), its crops and start stage, and `target` (%, whole 50–99, default 95). The room's volume, control settings and program numbers come from the room, as for a simulation run. Validation like the simulation (fields `physics.<key>`, `crops`, `farmType`, `stage`, `target` "Target must be a whole number from 50 to 99 %").

## 3. Estimates (`server/sizing.js`, pure; `estimate(input, ctx)`)

The stages searched: the start stage and the one after it (fruiting → rest, rest → fruiting, spawn → pinning, pinning → fruiting). The "strict" bands: per value the strictest of the two stages (the lowest CO₂ upper limit, the narrowest humidity band, the lowest temperature band middle).

| Machine | Formula | Rounded to *default* |
|---|---|---|
| Fresh-air fan (m³/h) | the blocks' CO₂ (60 mL/h each) ÷ ((CO₂ upper limit − 100) − 420 ppm): the flow that holds CO₂ 100 ppm under the limit when it runs all the time | the next of 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 3000 |
| Humidifier (L/h) | one minute of it moves RH a quarter of the narrowest band: band/4 × volume × satW(T middle) × 60 / 100 000 | the nearest of 0.3, 0.5, 1, 1.5, 2, 3, 4, 6 (at least 0.3) |
| Dehumidifier, largest (L/day) | its 3 min minimum run moves RH at most 0.8 × the narrowest band, at the rest stage's middle (its share of the rating from the model, `W − satW(5)` over the rating's) | the sizes 10, 12, 16, 20, 25, 30, 40, 50, 60 up to it |
| Aircon (BTU/h) | 1.3 × (walls × (day high − the lowest T middle) + sun + the blocks' heat (60 mL/h × 19.06 J/mL each) + the fan's air × 1.2 kJ/(m³ K) × (day high − T middle) / 3.6 + 120 W of fans), in BTU/h | the next of 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000 |
| Air exchange time limit (min) | 60 when the estimated fan runs more than half the time in the strict stage, else the room's | — |

`estimate` returns `{ fanFlow, humidifierLH, dehumidifierMaxLday, acBTU, exchangeMaxMin, why: { fanFlow, humidifierLH, dehumidifierLday, acBTU, exchangeMaxMin } }` (each `why` a short sentence with the numbers, e.g. "950 blocks give off 57 L of CO₂ an hour; 150 m³/h holds it at 800 ppm").

## 4. Search (`candidates(est)`, `rank(results, target)`; the job in a worker)

| Item | Rule |
|---|---|
| Candidates | fan: the estimate and the sizes one below and one above; humidifier: the estimate and the size below; dehumidifier: 0 and up to three sizes from 10 L/day to the largest (evenly picked); aircon: the estimate and the size above; time limit: the estimate's (and 60 when it is not 60) — at most 3 × 2 × 4 × 2 × 2 = 96 |
| Each candidate | `simulate()` over the two stages' days (program days, at most 30 *default*), with the candidate's machines and its time limit |
| Kept per candidate | `{ machines: { fanFlow, humidifierLH, dehumidifierLday, acBTU }, exchangeMaxMin, inBand: { t, rh, co2, all }, kWh, litres, removedLitres }` |
| Ranking | the ones with t, rh and co2 each ≥ target first, by kWh (least first); then the rest by their lowest of t, rh, co2 (highest first) |
| Reply | the best 5, the estimates with their `why`, `reached` (true when the best reaches the target) and `notes`: when none reaches it, the value that falls short and a plain hint ("Humidity stays above the band: the room has more water than these machines take out; fewer blocks or a wider humidity band would help"; "CO₂ stays above the band: a bigger fan or fewer blocks"; "Temperature stays above the band: a bigger aircon or better insulation") |
| Speed | in a worker thread like the simulations (one job at a time, the same queue); progress every candidate; about 1 s a candidate *default* |
| Storage | in memory (id, roomId, status queued/running/done/failed, progress, result, error); 20 kept per room; gone after a restart |

## 5. API

| Route | Reply |
|---|---|
| `POST /api/rooms/:id/sizing` | 202 `{ id, roomId, status, progress, total (the setups to try), createdAt, finishedAt, result: null, error: null }`; 400 `{ error, field }`; 404; 409 when the room already has a sizing waiting or running ("A suggestion is already being worked out for this room") |
| `GET /api/sizing/:id` | the same job (`progress` 0 to 1, `error` when failed) with `result` when done: `{ target, days, estimate, best: [candidate…], reached, notes }` |
| `DELETE /api/sizing/:id` | 204, stops it |

## 6. Simulation runs: a time limit of their own

`POST /api/rooms/:id/simulations` accepts `control: { exchangeMaxMin }` (whole 1–120, field `control.exchangeMaxMin`); the run uses it instead of the room's, `input.ctx.control` shows the one used, and the results page says "air exchange time limit 60 min (the room: 10 min)" when it differs.

## 7. Page (Simulate stepper)

| Part | Rule |
|---|---|
| Where | step 3 (Run), above Run simulation: **Suggest machines for these crops** with a Target (%) input (95) |
| While working | "Trying 34 of 96 setups…" with a progress bar; Cancel |
| Result | the estimates with their reasons (a short list); a table of the best setups: fan, humidifier, dehumidifier, aircon, time limit, temperature / humidity / CO₂ / all (%), kWh over the days searched; the first marked "Best"; a row that reaches the target marked, others not; the notes |
| Use this | fills step 1's fan flow, humidifier, dehumidifier and aircon and the run's time limit (shown in the summary: "air exchange time limit 60 min (the room: 10 min)"); the person then runs it (the whole program or 7 days) |
| A per-open token | late replies never paint into a closed or reopened dialog |

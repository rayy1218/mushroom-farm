# Electricity and water on the Charts tab (iteration 17)

Date: 2026-10-26 · Branch `v2` · Builds on iteration 7 (energy and water usage, `server/usage.js`) and the Charts tab (history ranges).

The owner asked (2026-10-26): "chart add section for electrical and water usage". The lead chose every default (*default*).

## 1. The section

| Item | Rule |
|---|---|
| Where | the Charts tab, a section "Electricity and water" under the T, RH and CO₂ charts, before the machine timeline; it follows the tab's range buttons (Live, 1 h, 6 h, 24 h, 7 d, 30 d) |
| Totals line | for the shown range: "12.4 kWh · RM 6.82 · 4.6 L water" and "metered" or "estimated" (the Energy card's words and prices; no price set: no RM) |
| Electricity chart (history ranges) | bars, one per history bucket (the range's bucket: the same steps as the other charts), the kWh used in it; y axis kWh; a hover tooltip with the time and "0.42 kWh (metered)" |
| Water chart (history ranges) | bars per bucket, the litres the humidifier used (run time × its L/h); y axis L |
| Live | the electricity chart is a line of the meter's power (W) over its last readings when the room has a meter, else "Live power needs an energy meter; pick a range for the estimate"; the water chart: "Pick a range to see water" |
| No usage at all | (no ratings, nothing ran) the bars at 0 with the totals "0.0 kWh · 0.0 L" |

## 2. Server

| Item | Rule |
|---|---|
| History reply | `GET /api/rooms/:id/history?range=…` gains `usage: { buckets: [{ at, kWh, waterL }], metered, totals: { kWh, waterL } }` with the reply's bucket size; the other fields unchanged |
| Metered | a room with an energy meter: a bucket's kWh = the meter's increase inside it (the Energy card's `meterStep` rules: a drop is a reset, skipped); buckets without readings are null and shown as gaps |
| Estimated | no meter: each machine's run time inside the bucket × its rating (the Energy card's `estimateDay` rules, the intake against the filter); the same for water with the humidifier |
| Code | a new `server/usage-buckets.js` reusing the functions of `server/usage.js` (run intervals, the estimate, the meter steps); `server/usage.js` itself changes only to export what is reused |
| Cost | at most one usage computation per history request; the 30 d range's buckets computed from the same queries the Energy card uses |

## 3. Tests

| Area | Cases |
|---|---|
| Buckets | estimate per bucket matches the day estimate summed; metered steps per bucket, a reset skipped, a bucket without readings null; water from the humidifier's run time; totals |
| API | the history reply carries `usage` for every range; a room without ratings |
| Page | the section's charts and totals, Live with and without a meter; browser check on a throwaway app |

## 4. Air exchange activity (owner, 2026-10-26: "add chart for hourly and daily air circulation activation count and time"; chose "Air exchange only")

| Item | Rule |
|---|---|
| Where | the Charts tab, a section "Air exchange" after "Electricity and water", before the machine timeline; shown when the room has a relay module |
| Its own switch | **Hourly** (the last 24 h, one bar per hour; *default*) · **Daily** (the last 30 days, one bar per local day); independent of the tab's range buttons |
| Charts | "Exchanges started" (count per hour / day) and "Minutes the fans ran" (per hour / day), bars; hover: the hour or day and the number |
| Totals line | "24 h: 41 exchanges, 2 h 35 min in all · longest 10 min" (Daily: "30 days: …") |
| What counts | a run of the intake fan as the machine log has it (commanded on → off; the exchange switches intake and exhaust together); a run that spans a bucket edge counts its minutes in each bucket and its start in the bucket it started in; a run still on counts up to now |
| Data | the history reply's machine log (`machines.intake`) of the 24 h and 30 d ranges, asked by the section itself; worked out in a pure function (e.g. `exchangeActivity(rows, from, to, stepMs)` → `[{ at, starts, minutes }]`), no server change |
| Tests | runs inside one bucket, across an edge, still on, none; hourly and daily steps (local days); totals and the longest run |

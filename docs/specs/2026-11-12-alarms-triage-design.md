# Alarms triage (iteration A)

Date: 2026-11-12 · Branch `feat/alarms-triage` from `v2` `85a8e87` · Builds on the alarms (2026-10-19-safety-and-history-design.md), the phone alarms (2026-10-26-live-alarms-outdoor-design.md) and the login (2026-11-06-login-design.md).

After the audits of 2026-11-12 the owner approved the order of work ("proceed"); this is the first iteration. The lead engineer chose every value marked *default*. Database 27 adds one column, `alarms.acked_by` (section 7).

## 1. Scope

| Finding | In | Out (later) |
|---|---|---|
| F1 | Temperature high and low and humidity low climb from Warning to Serious after 30 min out of band, and to Critical past the crop's own hot, cold or dry limit | Limits the owner edits per crop; tiers for high humidity and CO₂ |
| F2 + D1 | Active alarms first; the cleared ones not yet acknowledged fold into one line, grouped by cause, in neutral grey; they leave the list 12 h after they cleared (History keeps them); the status line counts the active rows | A setting for the 12 h |
| F3 | A gateway that does not answer raises one alarm, with the rooms' machine and sensor alarms held under it, so one Telegram message and one Cleared; a relay module that does not answer is one alarm, not one per machine | An outage log |
| D2 | Off the Now tab, a 44 px line in place of the Alarms card | |
| D3 | On Now at desktop widths the alarms span the page above the readings | |
| F4 | A worker's room page shows the bands, read only, and In band, Above band or Below band | |
| F13 | A worker acknowledges alarms; who acknowledged is kept on the alarm | |

## 2. Severity tiers (F1)

| Alarm | Warning (as today) | Serious | Critical |
|---|---|---|---|
| Temperature high (`tHigh`) | more than 1 °C over the band for 5 min | the same, still so 30 min after it began | above the room's hot limit (section 3) for 10 min |
| Temperature low (`tLow`) | more than 1 °C under the band for 5 min | the same, 30 min after it began | below the room's cold limit for 30 min |
| Humidity low (`rhLow`) | more than 5 % RH under the band for 5 min | the same, 30 min after it began | below the room's dry limit for 15 min, in pinning or fruiting only |
| Humidity high, CO₂ high | unchanged | — | — |

| Rule | What |
|---|---|
| One alarm | A tier change updates the alarm that is on (`db.escalateAlarm`): its level and text; the raise time stays. No second alarm for the same problem |
| Up only | Once Serious or Critical, the alarm keeps that level until it clears (back past the release line, as today) |
| Serious from the time | 30 min *default* after the condition began (`SERIOUS_AFTER_MS`), with the raise condition still holding (not only inside the release margin). The start is kept in memory; after a restart it is the stored raise time less the 5 min wait |
| Critical from a count | The hold of the limit is counted in memory from the first reading past it; a reading back inside the limit, a missing reading or a restart starts it again. Should the limit's hold end with no alarm on, the alarm is raised as Critical at once |
| Acknowledged | A tier change makes the alarm unacknowledged again: a Warning acknowledged at 14:00 that turns Critical at 14:20 has to be acknowledged again |
| Texts | Serious: "Temperature 28.4 °C: more than 1 °C over the band (24–26 °C) for 30 min". Critical: "Temperature 33.1 °C: above 32 °C, the hot limit for Grey oyster, for 10 min"; "Humidity 64.0 % RH: below 70 % RH, the dry limit for Grey oyster in fruiting, for 15 min" |
| Telegram | A tier change is an `escalated` alarm change; a level in the chosen levels sends a message as a raise does ("🟠 Serious · Container 1 · …"); Critical repeats every 30 min while not acknowledged, as now. The default levels (critical and serious) now carry a room that has been hot for 30 min |

## 3. Crop limits

The limits live with the crops (`web/crops.js`, `limits`). Sources: the research under `docs/superpowers/specs/2026-11-06-economics-defaults.md` (codes as there) and the growing guides behind the crop bands; where no source gives a number the limit is the lead's estimate, about 4–6 °C past the top of the crop's good fruiting range (a Malaysian lowland shed runs 28–32 °C, and its grey and pink oyster still fruit).

| Crop | Hot limit | Cold limit | Dry limit (pinning, fruiting) | Why |
|---|---|---|---|---|
| Grey oyster (P. pulmonarius) | 32 °C | 15 °C | 70 % RH | DOA: oysters at 28–30 °C (P08); lowland sheds peak about 32 °C; the audit's 30 °C falls inside what sheds fruit at (F14) |
| Black oyster | 30 °C | 12 °C | 70 % RH | A cooler strain (good range 21–25 °C) |
| Pink oyster (P. djamor) | 34 °C | 15 °C | 70 % RH | Fruits at 30–32 °C in Malaysia (P06); not below 15 °C (P27); the mycelium dies below 8–10 °C (P24) |
| Abalone oyster | 34 °C | 18 °C | 70 % RH | A warm crop (25–30 °C) |
| Golden oyster | 32 °C | 15 °C | 70 % RH | Good range 22–26 °C |
| Black jelly (wood ear, A. cornea) | 34 °C | 15 °C | 75 % RH | Grows at 18–33 °C (J26); the ears dry and stop growing in dry air |
| Reishi | 35 °C | 18 °C | 70 % RH | Good range 25–30 °C |
| Milky (Calocybe indica) | 38 °C | 22 °C | 65 % RH | A heat-loving crop (28–34 °C) |
| Lion's mane | 26 °C | 10 °C | 75 % RH | Fruits at 18–24 °C (L15); a warm strain to 27 °C (L28) |

| Rule | What |
|---|---|
| Several crops | The strictest: the lowest hot limit, the highest cold and dry limits |
| Next to the band | Never inside or just past the room's band: hot = max(the crops' hot limit, tHigh + 3 °C), cold = min(cold limit, tLow − 3 °C), dry = min(dry limit, rhLow − 10 % RH). A band set by hand above a crop's limit is the owner's choice |
| No crops | No limits: Warning and Serious only |
| Stage | Hot and cold in every stage; dry in pinning and fruiting only (a spawn run sits at 70 % RH on purpose, and the rest stage runs drier) |
| Shown | The limits are in the alarm texts; the crop card does not list them (*default*) |

## 4. One alarm per outage (F3)

| Item | Rule |
|---|---|
| Gateway down | In a poll cycle every device read through the gateway failed with no answer from it (`no connection` or `timeout`), at least one device was read. An exception or a bad reply means the gateway answered |
| Health | The poller passes each gateway's health to the controller after the cycle: `afterCycle(cycleStart, gateways)`, with `gateways` a list of `{ gateway, roomIds, polls, failed, down }` (`gateway` null for the farm's, `FARM_GATEWAY`) |
| The alarm | Key `gateway`, Serious, raised when the gateway is down in this cycle and in most cycles of the last minute (so after about 1 min of an outage, and never by a gateway silent one cycle in four), on the lowest-numbered room behind the gateway. Text, the place first and what to check (critique 2026-11-12): "Container 1's gateway not answering: no readings or commands (6 machines, 2 sensors). Check its power and network cable"; the address only in History ("· gateway 127.0.0.1:1512" after its times), kept on the alarm as it was raised (`alarms.gateway`, database 27; the farm's gateway by its FARM_GATEWAY text) and given as `gatewayAddress` to the owner only: a worker's replies leave it out (roles.js `HIDDEN_KEYS`; the farm app is on the internet); the farm's: "The farm's gateway not answering: no readings or commands for Room 1 and Room 5 (12 machines, 4 sensors). Check its power and network cable" |
| Held | In a cycle the gateway is down the rooms behind it are held (only then: final review 2026-11-12, a gateway alarm kept on by rare drops had held its rooms for an hour): their sensor fault (`sensorTrh`, `sensorCo2`), relay module (`relayNoAnswer`) and machine (`machine.*`) alarms wait: no new one is raised, one already on stays, their delay counts are kept. Their temperature, humidity and CO₂ alarms wait too: a probe gone silent with its gateway neither clears them nor drops their counts (review 2026-11-12: a 15 s outage had cleared a hot room's Critical alarm and sent Cleared); a held room's faulty probe clears them only once the room is no longer held |
| A missing reading | Pauses every alarm's count (the count is kept, a short gap counts), never restarts it, and never clears an alarm that is on (review 2026-11-12: gaps more often than every 5 min had hidden an alarm). A pause longer than 1 min (`MAX_GAP_MS`) does not count: the count, the Critical hold and the time to Serious move on by the gap, so the time out of band that was seen adds up across outages (review #12: restarting them had hidden a hot room behind a gateway out 90 s every 4 min) and the first reading after a 2 h outage raises nothing; a fault the room's sensor still has must hold 1 min before its alarm |
| Clears | When the gateway answers in this cycle and in more than three quarters of the cycles of the last 10 min (`GATEWAY_CLEAR_MS`; the raise needs more than half of the last minute down), so a flapping gateway (65 s out in every 130 s) is one alarm, not a raise and a Cleared every two minutes (one out 90 s every 5.5 min still gives a pair about every 11 min); or when no room is behind it any more. Its rooms are held only in the cycles it is down, so an alarm kept on hides nothing |
| Relay module | A relay module that does not answer (every output's status `no-answer`) is one alarm, `relayNoAnswer`, Serious, after 1 min: "Relay module not answering: 6 machines get no commands. Check its power and wires (address 3)". The outputs' own `machine.*` alarms are held while it is on. The aircon gateway is one machine, so `machine.ac` stays |
| Held list | The current-alarm replies give a `gateway` or `relayNoAnswer` alarm `held`: `{ machines: ['Intake fan', …], sensors: ['T/RH probe', 'CO₂ sensor'] }`, worked out from the rooms' wiring at the time of the read |
| Other rooms | A room behind the farm's gateway that is not the alarm's room shows the gateway alarm too on its own page (its `GET /api/rooms/:id/alarms` `current`) |
| Telegram | One message for the gateway alarm and one Cleared; nothing for the held ones (never raised) |

## 5. Cleared alarms fold away (F2, D1)

| Item | Rule |
|---|---|
| Current | Active alarms, and the cleared ones not acknowledged that cleared in the last 12 h *default* (`REVIEW_MS`). Older cleared ones leave the Overview, the room page and the replies' `current`; the room's History keeps every alarm |
| Order | Active first (critical first, then newest), then cleared, newest first |
| Count | The status line, the room cards' pills and the menu badge count active alarms only (as before); the Overview lists every active alarm (no cap of 10), so the count and the red rows agree |
| Fold | Under the active rows one line: "8 cleared to review" and a **Review** button (`aria-expanded`; Hide when open). With no active alarm the card shows only that line |
| Groups | Inside the fold, the cleared alarms of one room and one cause are one row: the devices that did not answer (machines with no answer, sensors with no reading, a relay module, a gateway) as one outage ("No answer (6 machines, 2 sensors)"; the UI check found a room's outage as three rows), other machine faults by fault ("Not running (switch on, no current) (2 machines)"), other sensor faults ("Sensor fault: jump (2 sensors)"), the same alarm raised again ("Temperature 27.4 °C: more than 1 °C over the band (24–26 °C) (3 times)"); a lone alarm is its own text. The row says "Last cleared 11:53" and has **Acknowledge** for the whole group; **Acknowledge all cleared** heads the open fold |
| Quiet card | With no active alarm the card is one 44 px line, "Alarms  8 cleared to review  Review"; open, the toggle stays where it was and the groups and History follow; the card's h2 stays for a screen reader, the toggle is named "Alarms: 8 cleared to review" |
| Look | A cleared row is neutral: a grey "Cleared" chip and ink text, never the red or amber of its level. The card's tone comes from the active alarms only (none: neutral) |
| Ack a group | `POST /api/alarms/ack` with `{ ids: [1, 2, …] }` (1–500 ids) → `{ acked }`, the number that were not yet acknowledged; unknown ids are skipped |
| Acknowledge all | The card's head button acknowledges the active alarms only (shown with two or more not acknowledged); the folded cleared ones have their own **Acknowledge all cleared** (critique 2026-11-12) |
| Focus | After an Acknowledge the focus goes to the next cleared group's Acknowledge, else the fold's toggle, else the card's title (the page's title when the card is gone); never to another active alarm's button, so Enter twice cannot acknowledge a live alarm |
| Phone | Under 760 px the open fold shows five groups and **Show all N** |
| Overview | The card takes its worst active alarm's tone; cleared groups use the active rows' columns (chip, room, text, time, Acknowledge) |

## 6. Where the alarms show on the room page (D2, D3)

| Place | Rule |
|---|---|
| Now, two columns (1100 px and wider) | The Alarms card spans both columns above the readings and the side column, so Auto, the Machines and the Crop start at the top of the side column |
| Now, one column (under 1100 px) | As before: under the readings (the Readings First Rule) |
| Other tabs | One line, 44 px high, in place of the card: "1 active alarm · 7 cleared to review" and a chevron (only the parts that are not 0; "7 cleared alarms to review" with none active; the link's name ends "· Open on Now"), to the Now tab, which puts the focus on the Alarms card; red from a serious active alarm, amber from a warning, neutral with only cleared ones, the cleared part always grey; one line with an ellipsis; hidden with no current alarm |

## 7. Workers (F4, F13)

| Item | Rule |
|---|---|
| Bands | A worker may `GET /api/rooms/:id/control` (read only; no money in it). Their room page reads it and paints the readings against the bands: the chips "In band", "Above band", "Below band", the band bars and the Manual chip, as the owner's. The Automatic control card stays the owner's (Setup tab) |
| Acknowledge | A worker may `POST /api/alarms/:id/ack`, `POST /api/rooms/:id/alarms/ack` and `POST /api/alarms/ack`; the Acknowledge buttons show for them. Switching machines, Auto and Manual stay the owner's |
| Who | Database 27: `alarms.acked_by` (TEXT, null for the alarms of before) holds the name of whoever acknowledged first (a worker's or the owner's); a tier change clears it with the time. The rows say "Acknowledged by Me", and History "Raised 10:42 · Cleared 10:50 · Acknowledged by Me"; each acknowledgement also writes a log line "Alarm 12 (Container 1, tHigh) acknowledged by Me" |
| Upgrade | 26 → 27 adds the two columns (`acked_by`, and `gateway`: section 4) in the one upgrade transaction (copy `data/v2.db` first, for instance to `data/v2-before-alarms.db`); tested on a copy of the audit's real version 26 farm file |

## 8. Routes

| Route | Change |
|---|---|
| `GET /api/alarms` | Current as section 5; `held` on gateway and relay module alarms |
| `GET /api/rooms/:id/alarms` | `current` as section 5, with a gateway alarm of another room on the same gateway; `history` unchanged |
| `GET /api/overview` | `alarms`: every active alarm and the cleared ones to review (at most 200) |
| `POST /api/alarms/ack` | New, section 5 |
| Worker routes | Adds `GET /api/rooms/:id/control`, `POST /api/alarms/:id/ack`, `POST /api/rooms/:id/alarms/ack`, `POST /api/alarms/ack` |
| Alarm change events | Adds `escalated` (`{ change: 'escalated', alarm }`); the live stream's `alarms { count }` follows it |

## 9. Decisions

| Decision | Choice | Why |
|---|---|---|
| Tiers as one alarm | Escalate the alarm that is on (level and text) | One problem stays one row and one thread on the phone; no schema change |
| Serious after | 30 min out of band | The audit's figure; long enough to pass an air exchange or a door opened, short enough that a container in the sun is still saveable (it passes 35 °C in 1–2 h) |
| Hot limit for grey oyster | 32 °C, not the audit's 30 °C | Malaysian sheds fruit grey oyster at 28–30 °C and peak near 32 °C; 30 °C would page a shed farm every afternoon |
| Hold before Critical | Hot 10 min, cold 30 min, dry 15 min | Heat kills fastest; cold here only comes from an aircon stuck cold and harms slowly; dry air aborts pins within hours |
| Dry limit only in pinning and fruiting | Yes | The spawn run's target is 70 % RH and rest runs at about 80 % RH |
| Limit next to the band | hot ≥ tHigh + 3 °C, cold ≤ tLow − 3 °C, dry ≤ rhLow − 10 % RH | A hand-set band must never be Critical in or near itself |
| Gateway alarm's room | The lowest-numbered room behind it; the other rooms show it too | The alarms table needs a room; one row keeps one message |
| Down = every device failed | Yes, with no answer from the gateway | A gateway that answers with exceptions is up; a dead RS-485 bus behind it looks the same as a dead gateway and has the same fix (go to the box) |
| Hold from the first failed cycle | Yes | The sensor fault (3 readings, 15 s) would beat the 1 min gateway delay otherwise |
| Relay module as one alarm | Yes | Its six outputs share one poll; six alarms for one box was half the audit's 66 messages |
| Review window | 12 h | The audit's figure: long enough to see the night's alarms in the morning |
| Group key | Room and cause | The designer's "Room 1: relay module no answer (6 machines)" |
| Who acknowledged | A column, `alarms.acked_by`, in database 27 | The lead's call (2026-11-12): the alarm says who; Money truth moves to 28 |
| Bands for workers | Open the control GET | It holds no money; the Overview already shows workers In band |

## 10. Open for the owner

| Question | Default now |
|---|---|
| Is 32 °C right for grey oyster in your containers, or do you want 30 °C as the audit said? | 32 °C |
| Should the limits be editable per crop on Settings? | Fixed in the app |
| Should Humidity high (a wet room) also turn Serious after some hours? | Stays a Warning |
| Is 12 h the right time for a cleared alarm to wait for review? | 12 h |
| Should Telegram's Cleared message stay on for every alarm (it is one per outage now)? | On |

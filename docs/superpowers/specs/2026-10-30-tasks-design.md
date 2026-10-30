# Tasks: daily, upkeep and long-term (iteration 19)

Date: 2026-10-30 · Branch `v2` · Builds on iteration 10 (Suggest machines), 11 (intake filter), 14 (crop stage plan).

The owner asked (2026-10-29) for a task tab with long-term and daily tasks: Suggest machines puts its changes into the long-term
tasks, and daily tasks come from the crop stage and common sense. Research first: farm practice
(`~/.claude/task-logs/tasks-tab/domain-research.md`, 35 sources: DOA ePengembangan, Bumi Hijau, polytechnic oyster manual,
myGAP, Malaysian aircon service firms, sensor makers) and the code (`~/.claude/task-logs/tasks-tab/code-map.md`). The owner
chose every row marked *owner*; the lead chose the rest.

## 1. Scope

| In | Out (later) |
|---|---|
| Daily stage tasks from each room's crops, stage and day in the stage *owner* | Tasks from sensor patterns (CO₂ high with the fan on → check fan and filter) *owner* |
| Recurring machine upkeep, counted from the last time done *owner* | Worker logins, assigning a task to a worker |
| Long-term tasks: **Plan this** on Suggest machines, and the owner's own *owner* | Photos on a completion |
| Who and when on every completion: a name from a worker list in Settings, no logins *owner* | A reviewer's sign-off on the log |
| A **Tasks** tab per room and a farm-wide **Today** page *owner* | Offline completion on a phone (WLAN still open) |
| Built-in rules the owner can turn off, re-time, and add to *owner* | Harvest records as their own module (the harvest check's kg is the first step) |
| Done on a long-term machine task offers to update the room's Setup *owner* | Contamination found outside a walk as its own "on sight" log |
| A log of done, skipped and missed tasks with CSV export (myGAP records) | |

## 2. Task kinds and statuses

| Kind | Made | Ends |
|---|---|---|
| Daily | per room per local day (Asia/Kuala_Lumpur), from the rules that apply that day | done, skipped, or **missed** when the day ends open; **cancelled** "Stage changed" when the stage changes and the rule no longer applies ("Rule changed" when the rule now wants another time of day), and open again if it applies again the same day (a stage changed and changed back) |
| Upkeep | one open row per room per rule; the next row is made when one is done or skipped, due *interval* days later | done or skipped; never missed: an open one past its due date says "overdue N days"; **cancelled** "The room no longer has this machine" when the machine its rule needs is taken out of the room (a rule turned off keeps its open row) |
| Long-term | by **Plan this** or by the owner's **Add** | done or **cancelled** (a reason is required) |

| Status | Set by | Needs |
|---|---|---|
| open | made | — |
| done | Done | a worker name; the amount when the rule records one (may be left empty) |
| skipped | Skip | a worker name and a reason |
| missed | the server, at the first making after the day ends | — |
| cancelled | Cancel (long-term), or the server on a stage or rule change (daily) or a machine taken out (upkeep) | a reason ("Stage changed", "Rule changed" or "The room no longer has this machine" from the server) |

Nothing is deleted, except with its room (as readings are today).

## 3. Rules

A rule: `{ key, text, kind: 'daily'|'upkeep', families|null, stages|null, when, slot: 'morning'|'afternoon'|'any', amount: { unit, label }|null, machine|null, everyDays (upkeep) }`. `when` for daily rules: `'daily'`, `'first'` (day 1 of the stage), `'last'` (the stage's last day by `days[stage]`), `{ every: N, lastDays: M }` (every N days within the stage's last M days, counted from day 1 of that window). A rule for two slots is two rules (`harvestAm`, `harvestPm`).

Crop families (from `web/crops.js` keys): **oyster** = oyster, black, pink, abalone, golden; **woodear**; **reishi**; **milky**; **lionsmane**. A room with several crops gets each rule once; its crop notes (section 3.3) join the row for the crops it has.

### 3.1 Daily stage rules (built in)

| Key | Text | Families | Stages | When | Slot | Records |
|---|---|---|---|---|---|---|
| contamWalk | Contamination walk: take out and bag any green, orange, black or slimy bags, away from the room | all | all | daily | morning | Bags removed |
| colonisedCheck | Colonisation check: are the bags fully white? Flag the ready ones | all | spawn | every 2 days, last 7 days | any | — |
| openBags | Open the bags (cut or remove the cap). Don't spray the opened bags for 2 days | oyster, woodear, lionsmane, reishi | pinning | first | morning | — |
| casingApply | Apply the sterilised casing soil (1–2 cm) and keep it moist with light sprays | milky | pinning | first | morning | — |
| reishiForm | Choose the form: bag closed for antlers, or open for caps (CO₂ under about 800 ppm) | reishi | pinning | first | any | — |
| humidifierCheck | Humidifier: water in, mist coming out | all | pinning, fruiting | daily | morning | — |
| harvestAm | Harvest check: pick before the cap edge waves or splits; pick before any misting | oyster, lionsmane | fruiting | daily | morning | kg picked |
| harvestPm | Harvest check (afternoon) | oyster, lionsmane | fruiting | daily | afternoon | kg picked |
| harvestDaily | Harvest check | woodear, milky | fruiting | daily | morning | kg picked |
| reishiRim | Check the caps' growing rim; harvest by cutting the stem, keeping about 2 cm | reishi | fruiting | every 2 days, whole stage | any | kg picked |
| scrapeRecap | Scrape the bag mouths with a clean tool, leave a day, then recap | oyster | rest | first | morning | — |
| reopen | Reopen the bags for the next flush | oyster, woodear, lionsmane | rest | last | morning | — |
| footbath | Change the footbath at the door | all | all | daily | morning | — |
| floorClean | Sweep and clean the floor after the day's work | all | all | daily | afternoon | — |

The done program (after the last flush, `program.done`) gives one daily rule instead of the stage rules:

| Key | Text | When | Slot |
|---|---|---|---|
| clearOut | Clear out the spent blocks, then clean and disinfect the room before new blocks go in | every day while the program is done | morning |

A room with no crops gets only footbath and floorClean.

### 3.2 Upkeep rules (built in)

| Key | Text | Every (days) | Only when the room has |
|---|---|---|---|
| acFilter | Wash the aircon filter and clear the drain tray | 7 | an aircon (always) |
| humidifierDescale | Descale and sanitise the humidifier (RO water; no bleach on the disc) | 7 | a humidifier (always) |
| flyTraps | Check the yellow fly traps; replace the full ones | 7 | — |
| dehumidifierFilter | Clean the dehumidifier filter and check its drain | 14 | dehumidifier fitted |
| co2Check | Check the CO₂ sensor against outdoor air (about 420 ppm) | 30 | a CO₂ sensor address |
| rhCheck | Check the RH sensor (it reads high after long spells above 90 %) | 90 | a T/RH sensor address |
| acService | Aircon service | 120 | an aircon |
| acChemWash | Aircon chemical wash | 180 | an aircon |

The intake filter stays on its pressure and days reminder (`filterDue`, `filterDirty`); it has no upkeep rule. The first row of an upkeep rule in a room is due the day it is made (the rule has no history yet).

### 3.3 Crop notes

| Crop | Note on harvest rows | Note on other rows |
|---|---|---|
| Pink oyster | Keeps 1–3 days after picking: pick on sale days | — |
| Golden oyster | Fragile when mature: pick early, handle gently | — |
| Black oyster | Heavy spores: wear a mask | — |
| Abalone oyster | — | contamWalk: black droplets on the mycelium are normal, not contamination |
| Lion's mane | Spines 6–13 mm and still white; brown or yellow means now | humidifierCheck: mist the air, never the mushroom |
| Wood ear | Ears 3–5 cm, before the edges thin; leave the small ones | — |

### 3.4 Owner changes

| Change | Where kept |
|---|---|
| A built-in rule off or on | `task_rule_settings.enabled` |
| A built-in upkeep rule's interval (1–365 days) | `task_rule_settings.every_days` |
| The owner's own rule: text (1–120 characters), rooms (all or a list), daily or every N days (1–365), slot | `custom_task_rules` (kind daily when "daily", else upkeep) |

## 4. Making the rows (`server/task-rules.js` pure, `server/tasks.js`)

| Step | Rule |
|---|---|
| `wantedDaily({ program, crops, date, rules })` | pure: the day's daily rows of one room — rule key, text, notes, slot, amount — from the stage and `stageDayOn(program, date)` (the stage's day in farm calendar days) on that date |
| `ensureDay(roomId, date)` | inserts the wanted daily rows (`ON CONFLICT DO NOTHING`, unique room, rule, date, slot), marks open daily rows of earlier dates missed, cancels today's open daily rows whose rule is no longer wanted ("Stage changed", or "Rule changed" for another slot) and opens such rows again when wanted again that day, cancels the open upkeep row of a rule that no longer applies to the room, and makes each applying upkeep rule's open row when it has none (due *interval* days after its last done or skip, but not before that day) |
| When | on `GET` of a room's tasks or of Today, and once per room per local day from the controller's cycle (an in-memory key of the date, crops, stage, stage days, flush, done, stageSince and the room's dehumidifier and sensor addresses, so it runs again when one of them changes), so a day is made after the app was down |
| Done or skip of an upkeep row | in one transaction: the row closed, the next open row due `at + everyDays` |
| A rule turned off | its open rows stay until done or the day ends; no new rows |

## 5. Data (database 19)

| Table | Columns |
|---|---|
| `tasks` | `id, room_id, kind CHECK(daily|upkeep|longterm), rule_key NULL, date TEXT NULL ('YYYY-MM-DD', daily), slot, text, note, status CHECK(open|done|skipped|missed|cancelled), due_at NULL, created_at, closed_at NULL, worker TEXT NULL, amount REAL NULL, unit TEXT NULL, reason TEXT NULL, source TEXT NULL (JSON: a suggestion's machine, from, to, rmMonth, suggestedAt)`; unique index `(room_id, rule_key, date, slot) WHERE kind = 'daily'`; index `(room_id, status)` |
| `workers` | `id, name UNIQUE, active` |
| `task_rule_settings` | `key PK, enabled, every_days NULL` |
| `custom_task_rules` | `id, text, rooms TEXT NULL (JSON ids; null = all), every_days NULL (null = daily), slot, enabled` |

The worker is stored as text on the task, so a renamed or removed worker never changes a record. `deleteRoom` deletes the room's tasks. About ten tests that pin version 18 move to 19. Backup `data/v2-before-tasks.db` before the owner's farm app first starts on 19.

## 6. API

| Route | Body → reply |
|---|---|
| `GET /api/rooms/:id/tasks` | → `{ date, today: [row], upkeep: [row], longterm: [row], counts: { due, overdue, longterm } }` |
| `GET /api/tasks/today` | → `{ date, rooms: [{ id, name, today, upkeepDue, longterm: count }] }` in the Overview's room order |
| `POST /api/tasks/:id/done` | `{ worker, amount? }` → the row |
| `POST /api/tasks/:id/skip` | `{ worker, reason }` → the row (not for long-term) |
| `POST /api/tasks/:id/cancel` | `{ reason }` → the row (long-term only) |
| `POST /api/rooms/:id/tasks` | `{ text, note? }` (own) or `{ suggestion: { machines: [{ key, from, to }], rmMonth, suggestedAt } }` → the new rows |
| `GET /api/rooms/:id/tasks/log?before=<id>` | → the closed rows newest first, 50 a page |
| `GET /api/rooms/:id/tasks/log.csv` | → every closed row: date, time, room, task, status, worker, amount, unit, reason |
| `GET/PUT /api/workers` | `[{ id?, name, active }]` |
| `GET/PUT /api/task-rules` | `{ builtin: [{ key, enabled, everyDays? }], custom: [...] }` |

A change publishes `room { id, part: 'tasks' }` and a `tasks { due }` event (the top bar's count).

| Error | Reply |
|---|---|
| Done, skip or cancel on a row that is not open | 409 "Already done by Ali at 09:12" (or skipped, missed, cancelled) |
| No worker name on done or skip | 400 field `worker` "Pick who did it" |
| Skip or cancel without a reason | 400 field `reason` "Say why" |
| Amount below 0 or above 10 000 | 400 field `amount` |
| A suggestion where nothing changes | 400 "Nothing changes from what the room has now" |
| A rule's interval outside 1–365, a worker name empty or taken | 400 with the field |

## 7. Pages

### 7.1 The room's Tasks tab (`#/rooms/:id/tasks`)

Tabs: Now · History · Crop · **Tasks** · Simulations · Setup. The tab carries a dot with `counts.due`: open daily rows of today plus upkeep rows due today or overdue (`.tab-dot`).

| Part | Shows | Actions |
|---|---|---|
| Today | today's daily rows by Morning / Afternoon / Any time; each row its text, the crop notes muted under it; closed rows folded into "6 done" | **Done** (an amount box when the rule records one), **Skip** (asks the reason) |
| Upkeep | overdue first ("overdue 3 days"), then due within 7 days, then the rest with their next date | **Done**, **Skip** |
| Long-term | open rows: "Aircon 9,000 → 12,000 BTU/h · RM 42 a month less · from Suggest machines, 29 Oct" | **Done**, **Cancel** (asks the reason), **Add** (text, optional note) |
| Log | the last 14 days closed: time, task, status, worker, amount, reason; **Older…** | **Export CSV** |

### 7.2 Today (`#/today`)

A **Today** link in the top bar with the sum of every room's `counts.due`.

| Part | Shows |
|---|---|
| Worker | "Doing the rounds as: Ali ▾" from Settings' workers, kept per browser; the first Done or Skip asks when none is chosen |
| Rooms | each room in the Overview's order: its open daily rows by slot and its overdue upkeep, with Done and Skip in place; "6 done" folded |
| Long-term | a line per room with open long-term rows: "2 long-term tasks" → the room's Tasks tab |

### 7.3 Settings

| Card | Contents |
|---|---|
| Workers | names: add, rename, remove (removed names stay on old records) |
| Task rules | every built-in rule with its families, stages or interval and an on/off switch; the interval editable for upkeep rules; **Add your own** |

### 7.4 Suggest machines

**Plan this** beside **Use this** on each suggestion row. It opens a dialog listing each machine that differs from the baseline (from → to) and the RM a month against the baseline; **Plan** posts it and links to the room's Tasks tab. With no baseline the button is not shown (the "from" is unknown).

### 7.5 Done on a long-term machine task

| Machine | Setup update offered |
|---|---|
| aircon (BTU/h) | `acInputW` = BTU/h ÷ 11.25, rounded to 10 W (the page's class rule) |
| humidifier (L/h) | `humidifierLH` |
| dehumidifier (L/day, 0 = none) | `dehumidifier` fitted and `dehumidifierLday` |
| fan (m³/h) | none: the room keeps no fan flow; Done only records it |

The dialog shows the Setup values before and after, editable; **Save and mark done** saves Setup first (the room's PUT) and marks the task done only when that worked; **Just mark done** skips the update.

## 8. Testing

| Area | Tests |
|---|---|
| `wantedDaily` | each stage and family; first and last day; every 2 days in the last 7; mixed crops give a rule once with both notes; done program gives clearOut; no crops; rules off; custom rules for some rooms |
| Upkeep | machine conditions; next due after done and skip; overdue days; interval change |
| Database | 18 → 19 on a copy; `ensureDay` twice makes no duplicates; missed at the day's end; cancelled on a stage change; worker text kept after rename |
| API | each route and error above; done twice (409); CSV columns; Plan this from a suggestion |
| Pages | route and panel tests at six tabs; slot grouping, overdue words, the Setup update values; the source checks the pages use today |
| Live | after the restart: the Tasks tab and Today at 390 px and 1440 px with the owner's four rooms |

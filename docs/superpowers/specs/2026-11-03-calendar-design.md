# Calendar: the farm's tasks by day (iteration 21)

Date: 2026-11-03 · Branch `v2` · Builds on iteration 19 (Tasks), 14 (crop stage plan) and 20 (pictures).

The owner asked (2026-11-03) for "task in calendar" and chose every row marked *owner*: a calendar page in the app (not
Google Calendar or a subscribed .ics feed), for planning ahead and looking back equally, one page for the farm with a room
picker, a month grid with a day list, and future days that list what changes with the daily routine folded. The lead chose
the rest; the owner approved the design before this spec.

## 1. Scope

| In | Out (later) |
|---|---|
| A **Calendar** page in the top bar beside Today, `#/calendar` *owner* | Google Calendar, an .ics feed *owner* |
| All rooms or one, picked on the page; the Tasks tab links to it with its room picked *owner* | A calendar part on the Tasks tab |
| A month grid and the picked day's list *owner* | A week agenda view |
| Past days: the task rows as closed (done, skipped, missed, cancelled), with who, the amount and the reason *owner* | Editing a past day |
| Today: the open tasks, with a link to Today to tick them (Done and Skip stay in one place) | Done and Skip on the calendar |
| Future days: stage starts, the stage tasks the rules would make, upkeep due; the routine folded *owner* | Long-term tasks (they have no date) |
| `GET /api/calendar`, worked out by the server with the rules that make each day's tasks | Storing future tasks |

## 2. A day's items

| Day | Items |
|---|---|
| Past (before today, farm time) | The room's daily rows of that date in any status (an open one from a day the farm app missed closing counts as missed); upkeep and long-term rows closed that day (closedAt's farm date). Nothing worked out. |
| Today | The daily rows of today (made on the request, as Today does) in any status; open upkeep due today or overdue ("overdue 2 days"); upkeep and long-term rows closed today; a stage that starts today by itself. |
| Future (up to 92 days ahead) | Worked out (section 3): the stage that starts that day, the daily rules' tasks for that day's stage and stage day, the upkeep due that day. |
| Further ahead | Nothing; the page says "The calendar looks 92 days ahead." |

An item: `{ roomId, kind: 'stage' | 'daily' | 'upkeep' | 'longterm', status: 'open' | 'done' | 'skipped' | 'missed' |
'cancelled' | 'planned', ruleKey, text, note, slot, worker, amount, unit, reason, routine, about, stage }`. `stage`
(kind 'stage' only): `{ stage, flush, done }` (done: the program ends, "Replace the blocks"). `about`: true on a worked-out
item that rests on a stage changing by itself (the dates of the stage plan are estimates). `routine`: true for
contamWalk, humidifierCheck, footbath, floorClean and an own daily rule.

## 3. Working out future days (`server/calendar.js`, pure)

| Step | Rule |
|---|---|
| The stage on a day | From the program: while automatic change is on, step it with `nextStage` at `stageEndsAt` (the Crop tab's stage plan, the same dates); with it off, the current stage carries on and no change is shown. Past the last flush's rest: the program is done ("Replace the blocks" on that day, then the done rules). |
| A stage start | An item of kind 'stage' on the day a stage starts by itself: "Rest between flushes starts · flush 1". |
| The daily tasks | `wantedDaily({ program: the program as on that day, date, rules })` with the room's `effectiveRules` (the owner's switches and own rules), so first-day, last-day and every-N-days rules fall where the farm will make them. On a day a stage starts (code review 2026-11-03: the farm makes the day's rows at midnight under the old stage, then the new stage's at the change, cancelling the old): the old stage's tasks the new one does not want say "Until the stage changes, about 15:09", the new stage's own "From the stage change, about 15:09"; today, only what a change later today adds. |
| Upkeep | Each open upkeep row on its due date, then its rule's next rows every interval after it (in the rule's words now), as if each is done on its day; an overdue one repeats from today. A rule turned off keeps its open row: it shows once, with no repeats. A rule with no open row (a new room before its first making) shows none. |
| A room without crops | Its own rules (footbath, floor, own rules) and its upkeep. |

## 4. API

`GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&room=id]` → `{ today, from, to, horizon, rooms: [{ id, name, crop }],
days: [{ date, items }] }`. `crop`: the crop reply without targets (as the Overview), for the room's picture and harvest
pictures. `horizon`: today + 92 days. Errors: 400 for a bad date, `to` before `from` or more than 42 days ("Ask for 42 days
or fewer"), 404 for no such room. Rooms in the Overview's order. No database change.

## 5. The page (`web/calendar-page.js`, `web/calendar-math.js` pure)

| Part | Design |
|---|---|
| Head | "Calendar", the room picker (All rooms, then each room), a Today button, ‹ › for the month and the month's name. The address keeps the room and the day: `#/calendar?room=2&day=2026-11-04`. |
| Month grid | Monday first, 6 rows. A day shows its number and, on a desk (from 760 px), up to 3 pictures at 20 px, in this order: the bag of a stage starting (in its new stage), the harvest basket (with the room's crop), an upkeep or stage task's picture; then "+N". A phone shows up to 3 neutral dots instead. A past day with a missed task shows an amber dot (warning: a task not done). Today is ringed in the accent; the picked day is filled. Days outside the month are muted. Each day is a button: "Wednesday 4 November: 3 tasks, Container Alpha rest starts". |
| Day list | Beside the grid from 1100 px, under it below. Its title is the day ("Wednesday 4 November", "Today"). Grouped by room in the Overview's order, each with its crop picture and name. Rows reuse the task row's look without its buttons: the task's picture, name and detail; past rows the closed line ("Done 08:12 by <worker> · 2.4 kg", "Missed"); future rows "about" when worked out over an automatic stage change. Stage starts first, then by slot (Morning, Afternoon, Any time), upkeep last. The routine folds under "+ 4 daily tasks" (a details). Today: a link "Tick them on Today". No items: "Nothing on this day." |
| Top bar | "Calendar" beside Today (an icon and the word; the icon alone on a phone). |
| Tasks tab | An "Open in the calendar" link in the Today part's head, to `#/calendar?room=<id>`. |
| Loading | The month asked once per change of month or room, refreshed on the tasks events (as Today). |

## 6. Testing

| Test | Covers |
|---|---|
| `tests/calendar.test.js` (pure) | Stage boundaries from the plan; first-day (open the bags), last-day (reopen) and every-2-days (reishi rim) rules on the right days; automatic change off; the last flush ending in done; upkeep repeating from the open row's due date; a turned-off rule and an own rule; a room without crops; a mixed room's notes; routine flags; `about` |
| `tests/api-calendar.test.js` | Past rows by date, today's rows and overdue upkeep, a worked-out future day, the room filter, the 400s and 404 |
| `tests/web-calendar-math.test.js` | The grid (Monday first, 6 rows, outside days), a day's markers in order, the day list's grouping and folding, the address |
| Look | 1440 and 390 px, both themes; the detector on the changed files |

# Tasks as a grid: the room's daily log sheet (iteration 23)

Date: 2026-11-04, revised 2026-11-05 after the UI/UX audit (`.impeccable/critique/2026-11-04-task-grid.md`) · Branch `v2` · Builds on iteration 19 (Tasks), 21 (Calendar) and 22 (Harvest).

The owner showed a paper maintenance log (dates down, checks across, ticks and initials, "Sheet reviewed by") and asked
for the Tasks tab to read like it: "it is very clear to see". They chose every row marked *owner*. The lead chose the rest
(approach A: the grid is built on the page from the replies the Tasks tab and the Calendar already get).

## 1. Scope

| In | Out (later) |
|---|---|
| A grid on the Tasks tab: days × the room's daily tasks, this week, ‹ › to other weeks *owner* | A grid for upkeep or long-term tasks (no daily rhythm) |
| The grid replaces the Tasks tab's day list and its Log; Upkeep and Long-term stay below *owner* | A grid on the Today page or the Calendar *owner* |
| Desk: days down, tasks across; turned (tasks down, days across) where the columns do not fit the card, as on a phone *owner* | Editing a past day |
| Tap an open box of today: Done at once; a kg or bags task opens its dialog; long press / right-click / menu key: Skip…, Undo or Details *owner* | Setting initials in Settings |
| Undo a Done or Skip within 1 minute of it *owner* | Undo of upkeep or long-term rows |
| Print month: one A4 per room per month, filled from the app, blank for a pen ahead, Farm and Reviewed-by lines *owner* | A blank sheet with no app data |
| The Log's CSV export stays (**Export CSV**, under the legend, beside **Print month**) | |

## 2. The grid

| Part | Rule |
|---|---|
| Days | Monday to Sunday of the week shown (farm time). ‹ › move a week; **This week** comes back. The address keeps it: `#/rooms/7/tasks?week=2026-11-02` (a Monday; any other day means its week; a week that is not a date falls back to this week). The grid does not add a history entry for each week. The room page's Tasks tab link keeps the week while you are on that room, so leaving the tab and coming back shows the same week. |
| Columns | Every daily rule that has a row or a planned item on any day of the week, in the order the server makes a day's rows: **Clear out first** (`clearOut`), then `DAILY_RULES`, then the owner's own rules by id. A rule with two slots (none today: harvestAm and harvestPm are separate rules) would be two columns. |
| Column head | A button: the rule's picture (the task pictures, `web/pictures.js`) at the top, its short name (section 2.1) under it, two lines at most on a desk, and the unit once under the name in a muted line: "kg" for a harvest check, "bags removed" for the contamination walk (the Units Rule: the boxes' amounts are bare). Its tap opens a dialog with the rule's full text. The full text is also the button's title. |
| A past box | done: a drawn tick (18 px, not the font's ✓) and the worker's initials; with an amount, "✓ 2.4" and the initials under it (the head says kg or bags; turned, the amount sits under the tick). missed: amber **✗** in a box tinted amber (`warning-soft`, its border the amber at 45 %), the only amber in the grid. skipped: **—**. cancelled: empty and shaded (the stage or rule changed). Not due that day: empty and shaded (the ink at 9 %, about 1.35 : 1 on the card). A box that holds a row is a button for its Details. |
| Today's boxes | open: an empty box with a 2 px outline, a button. done/skipped as a past box. Today's row is ringed in the accent on a desk; turned, today's column is tinted `accent-soft` from its head to its last box, through the task names' rows. A box that was tapped waits, dimmed, until the room's reply shows its row changed (a second tap would send again). |
| A future box | A planned item (the Calendar's worked-out day): a faint dashed outline, not a button; "about" (over an automatic stage change) adds a "≈" in the corner. |
| Initials | From the worker's name: two words or more → the first letters of the first two ("Ali Lee" → "AL"); one word → its first two letters ("Sara" → "SA"). When two names on the week's or the workers' list would share them, each of those takes three letters: two words or more → the first letter of the first and the first two of the second ("Ali Lee" → "ALE", "Amin Lau" → "ALA"); one word → its first three ("Sara" → "SAR"). Still the same at three: the first name cut to 4 letters as written ("Aliy", "Ali"). Names that do not clash keep two letters. Upper case for initials, the name as written for the cut. |
| Undo line | After a Done or Skip from the grid (a tap, the menu's Skip…, Details' Done or Skip…), once the room's reply has the row closed: "Floor done by Sara · **Undo**" under the grid, a quiet button, in a polite live region (`role="status"`). It goes after a minute (the server still has the last word), at the next tap, on Undo, or when the row opens again elsewhere. The menu keeps its Undo. |
| Legend | One line under the grid, each box as it shows (18 px, the same classes) with its words: "[ ] to do · [✓] done, initials · [✗] missed · [—] skipped · [░] not due · [┄] planned · ≈ date estimated". One list (`LEGEND`) for the grid and the sheet, which leaves out planned and ≈. |
| Foot | **Print month** · **Export CSV**: every done, skipped, missed and cancelled task, for the myGAP records. |
| Empty | A room without crops shows its own rules (footbath, floor, own rules); a week with no daily rows and nothing planned: "No daily tasks this week." |

### 2.0 The card and its layout

| Part | Rule |
|---|---|
| The card | Titled **Daily tasks**. In its head, the worker picker ("Doing the rounds as"). Under it the day line ("Today, Thursday 5 November · 3 tasks due · Open in the calendar"). Then the grid's own head as the Calendar's (the week's dates, then ‹ This week › at the right), the grid, the Undo line, the legend and the foot (Print month · Export CSV). The head, grid, Undo line and legend stop at the grid's own width. |
| Phone head | ‹ the week's dates › on one row; **This week** under them only while another week is on show. |
| Under 900 px | One column of cards: Daily tasks, Upkeep, Long-term. |
| From 900 px | Daily tasks across the top; **Upkeep** and **Long-term** side by side under it. |
| Desk grid | Days down, tasks across; the day's name in the first column (88 px). Columns of one width, 92 px ("Contamination" whole) to 150 px. |
| The turn | By the card, not the screen: when the card is narrower than the desk grid's least width (88 + 92 px a task), the grid turns (a `ResizeObserver` on the card), so a phone, a 700 px tablet or a desk with many tasks gets it: each task's **name on its own line** (picture, short name, unit) over its **7 day boxes**, one row of seven under it, at most 720 px wide. The day heads (M 2, T 3 …) stay in a row at the top; today's column is tinted. |

### 2.1 Short names

| Rule | Short name |
|---|---|
| contamWalk | Contamination walk |
| colonisedCheck | Colonisation check |
| openBags | Open the bags |
| casingApply | Casing |
| reishiForm | Reishi form |
| humidifierCheck | Humidifier |
| harvestAm | Harvest AM |
| harvestPm | Harvest PM |
| harvestDaily | Harvest |
| reishiRim | Reishi rim |
| scrapeRecap | Scrape and recap |
| reopen | Reopen the bags |
| footbath | Footbath |
| floorClean | Floor |
| clearOut | Clear out |
| An own rule | Its text, cut to 24 characters with "…" at the last whole word ("Check the water tank…"; one long word is cut inside it) |

## 3. Acting on a box

| Action | Rule |
|---|---|
| Tap an open box of today | Done by the worker this browser does the rounds as (the Tasks dialogs' worker, `farm.worker`), as the one-tap Done of the Tasks list; no worker picked yet: the Done dialog asks who. A row that records an amount (kg, bags) opens the Done dialog (with the kg per crop and the implausible-pick check of iteration 22). |
| Long press (500 ms), right-click, Shift+F10 or the menu key on a box that holds a row | A small menu under the box (over it where the screen ends), by the box's state (section 3.1). Opened by the keys, its first item takes the focus; by a pointer, the menu itself does (nothing looks picked); the focus ring sits inside the item. A press that moves more than 10 px is a scroll. The tap that ends a long press does not also act. The menu closes on Escape, Tab, a click outside, a scroll or a resize; the grid does not repaint while it is open. |
| Tap a past or closed box | Details: the task's text and note, its status, who, when (closed time; none for a missed box), the amount (a Done of two crops or more: "By crop: Grey oyster 150.00 kg · Lion's mane 4.20 kg" under it, from the room's harvests, `GET /api/rooms/:id/harvests`, as the calendar item holds only the sum; the box keeps the sum), the reason. Details of today's open box (from its menu) has **Skip…** and **Done** beside Close, acting as the menu and the tap. |
| After a Done or Skip | The Undo line under the grid (section 2) for a minute. |
| Tap a column head | The rule's full text in a dialog. |
| Undo | `POST /api/tasks/:id/undo`: a daily row done or skipped at most 60 s ago (the server's clock) opens again: status open, closed time, worker, amount and reason cleared, and the harvests that its Done made deleted, in one transaction. Publishes the tasks events and, when harvests went, `harvest`. The refusals are in section 3.2. |
| Keyboard | One Tab stop in the grid (`role="grid"`): the box it was on, else today's first open box. Arrow keys move, Home and End to the row's ends (with Ctrl, the grid's), Enter or Space acts as a tap, Shift+F10 or the menu key opens the menu. After a dialog or the menu closes, the focus returns to the box. |
| Refresh | On the tasks and harvest events and when the stream comes back, at most once in 2 s. |

### 3.1 The menu by state

| Box | Skip… | Undo | Details |
|---|---|---|---|
| Open, today | yes | no | yes |
| Done or skipped today, in the last minute | no | yes | yes |
| Done or skipped today, over a minute ago | no | no | yes |
| Past box with a row (done, skipped, missed, cancelled) | no | no | yes: a **Details-only** menu |
| Not due, or planned | no menu | no menu | no menu |

### 3.2 Undo's refusals

| Case | Status and text |
|---|---|
| No such task | 404 "Task not found" |
| Not a daily row | 409 "Only a daily task can be undone" |
| Open, missed or cancelled | 409 "It is not done or skipped (it is open)" |
| Over 60 s, or the row changed between the check and the write | 409 "Too late to undo: it was done at 08:12" (or "skipped at …"; farm time) |

The grid shows the text in red under the day line and reads the week again.

## 4. Print month

| Part | Rule |
|---|---|
| Where | **Print month** in the card's foot, beside Export CSV, opens `#/rooms/7/tasks/sheet?month=2026-11` (the week's month), a print page as the myGAP sheet: **Print** and **Back to Tasks** buttons, hidden in print. Back returns to the week the Tasks tab showed. A month that is not `YYYY-MM` falls back to this month (the farm's, put in the address). |
| Page | A4 portrait when the month has 12 columns or fewer (13 mm a column at 12, the heads sideways), landscape above, over two pages: the 1st to the 15th, then the rest, the heads again, the foot on the second. Every row 7 mm, tall enough to write in. Light colours, no top bar. |
| Phone | The day column stays at the left while the columns scroll sideways; the heads are written sideways (reading upwards) at any column count. On paper the day column is plain. |
| Head | "Farm: ____" (blank line), "Daily tasks · Container 1", "November 2026". |
| Table | Days 1 to the month's last down (two weekday letters beside the number, "1 Su"; each Sunday's row ruled off with a heavier line); the month's columns across (section 2's rule over the month), heads as short names with the unit in brackets ("Harvest AM (kg)", "Contamination walk (bags)"), written sideways when a column gets less than 22 mm (and always on a phone; on paper they wrap at 24 mm); the last column **Initials** is shaded on days gone and left for the pen on today and the days to come, and left out in a month gone by. Boxes: ✓ and initials ("✓ AL"); with an amount, "✓ 19.59" over the initials in a smaller size; ✗ the heaviest mark (1.3 em, 800; amber on screen, black on paper); —; shaded not due. Days ahead blank, with the boxes of planned tasks outlined: dashed on screen, square solid cells on paper, inset 0.4 mm. |
| Foot | "Sheet reviewed by: ________ (Management) on ________" and the legend, each box drawn: "[ ] to do · [✓] done, initials · [✗] missed · [—] skipped · [░] not due". |
| Data | `GET /api/calendar?room=7&from=…&to=…` for the month (31 days or fewer, under the 42-day limit). It reads again on the room's tasks, crop, name and harvest events, when the stream comes back, and every 60 s. |

## 5. Data (approach A)

| Need | From |
|---|---|
| Past days, today's closed rows, future planned items | `GET /api/calendar?room=&from=&to=` (iteration 21), as it is: items carry status, ruleKey, text, note, slot, worker, amount, unit, reason, about |
| Today's open rows with their ids, `harvestCrops`, `amountLabel` | `GET /api/rooms/:id/tasks` (as the Tasks card reads now) |
| Undo | New: `POST /api/tasks/:id/undo` (section 3) |
| Bad addresses | `?week=`, `?day=` (the Calendar's) and `?month=` that are not dates fall back: this week, no day picked, this month |
| The pivot | Pure, `web/task-grid-math.js`: columns, cells, initials, short names, the week and month ranges, the box's words for screen readers ("Footbath, Wednesday 4 November: done by Sara at 08:12") |

## 6. Testing

| Test | Covers |
|---|---|
| `tests/web-task-grid-math.test.js` | Columns over a week and a month; every box kind (done with amount, missed, skipped, cancelled, not due, open, planned, about); initials incl. a clash at two and three letters; short names at a whole word; units in the heads; the desk width; a mixed Done's split; the Undo line's state; the sheet's rows (weekdays, Sundays, the Initials column, the box parts); week from any day; aria words |
| `tests/tasks-undo.test.js` (+ API) | Undo within 60 s; 409 after; a Done with harvests: the harvests go and the `harvest` event; skipped rows; refused for upkeep and long-term; events |
| `tests/web-task-grid.test.js` | Source checks: the grid replaces the day list and the Log, the long-press menu, keyboard roles, the CSV link stays |
| Look | The UI/UX audit step (Impeccable critique + audit), 1440 and 390 px, both themes, the print sheet; then the code review and the finish review |

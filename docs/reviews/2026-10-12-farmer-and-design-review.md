# Mushroom farm app: farmer and UI/UX critique (2026-10-12)

## Scope

| Item | Value |
|---|---|
| Build reviewed | master 8ed210f, served from a snapshot at http://10.0.1.120:8081 with a new, empty database |
| Not reviewed | your checkout `fix/room-drawing` (port 8080). It is 295 commits behind master and its Rooms page is a stub that says "This part of the app is not installed." |
| Reviewers | **Farmer**: Pak Ahmad, 52, 20 years growing oyster and lion's mane, no digital skills, phone first. **Designer**: senior SaaS/IoT product designer. |
| Evidence | Farmer: `/tmp/uxreview/farmer/v2/` (not kept in the repo). Designer: `/tmp/uxreview/designer/v2/`. Old build: `/tmp/uxreview/designer/`. |
| Repo changes | None during the review. Test data lived in a separate database under `/tmp`. |

## Your three complaints: verdict

| Your complaint | Farmer | Designer | Verdict | Root cause |
|---|---|---|---|---|
| "I don't know what this is about" | Thought "virtual room" meant a computer game. Read "Live / ALL GOOD" on a room with nothing connected. | Confirmed. The intro explains the method (Live → Calibrate → Simulate), not the purpose or the first step. | **Confirmed** | No real-vs-simulated marking anywhere. No first-run guide. Developer wording. The menu is named after tools, not farm jobs. |
| "Forms feel ugly" | Batches form overlaps on the phone; raw error `block_wet_kg: required`. | Confirmed strongly. Fonts never load. Native inset inputs. No shared field style. Buttons touch each other. Errors in 12 px grey mono. | **Confirmed** | `styles.css` names Barlow/IBM Plex but has no `@font-face`. Each module styles its own inputs. `.tag` is used for help, status and errors. No primary, danger or disabled button styles. |
| "Lacking in visualization" | Wants big red/green room cards and kg on the card. | Confirmed for the farmer's screens. The Test bench has rich charts, but the room Live tab shows machines as a bullet list. Capacity, cycle, equipment and yield are prose and tables. | **Confirmed on the screens that matter** | All visual work went into `web/simulator.js` (sandbox). `rooms.js`, `room-live.js`, `room-simulate.js` and `batches.js` render text. |
| "Use a standard application layout" | Header uses ~270 of 844 px on a phone. Room page is 5 screens long, of which only the first is useful to him. | Partly. Master has a breadcrumb, room header and tabs, but no farm overview and no main action per page. Settings sit under the charts on the Live tab. | **Mostly confirmed** | The page structure follows the code modules (`MENU_NAMES` in `web/shell.js`), not the farm → room → batch hierarchy. |

## Merged findings, most severe first

| # | Area | Problem | Found by | Severity | Fix | Files |
|---|---|---|---|---|---|---|
| 1 | Trust | Simulated rooms are labelled "Live / RUNNING / ALL GOOD". New rooms start running at once as grey oyster, fruiting, with no sensors. The Test bench says "LIVE". | both | high | "SIMULATED" / "Not connected" badge on cards and header; "SANDBOX" banner on the Test bench | `web/rooms.js statusChip()`, `#rhFeed`, `web/simulator.js` |
| 2 | Status | A room 1.5 °C over target (aircon left on Manual Heat) shows a small grey "Out of band" chip, while the header says green "NO ALARMS". By design the alarm only fires at target + 2 °C (`controller.js:213`). Out of band is `info` level, and a Manual override is never flagged. A CO₂ purge may also set "Out of band" while all readings say in band (farmer's observation; the chip treats any non-good `st.CO2` as out of band). | farmer | high | Out of band = amber, not grey. A "MANUAL" flag on card and header whenever a machine isn't on Auto. Don't count a normal purge. | `web/rooms.js:19-24`, `web/room-live.js` |
| 3 | Harvest | No in-app "Record harvest". The only way in is printing QR stickers. Kg are not shown on rooms. The phone harvest page itself is the best screen in the app. | farmer | high | "Record harvest" button on each room card, opening the same page; "Today: 25 kg" on the card | `web/rooms.js`, `web/harvest.js`, `web/batches.js:74` |
| 4 | Targets | After switching to lion's mane, the Targets panel shows 25 °C / 88 % while the log says 17 °C / 92 % ramping over 4 h. The confirm box gives no crop-range warning (e.g. 16 °C for oyster). | farmer | high | Show the crop target plus "moving from 25 °C, ready by 14:05". Warn when a value is outside the crop's range. | `web/room-live.js`, `web/settings-panel.js` |
| 5 | Layout | No farm overview. Monitoring and settings share one long Live page (4,184–4,959 px on a phone). Settings, Versions and Room details sit below the charts. | both | high | App shell with sidebar (bottom tabs on phone). Overview home. Split Live into Overview and Settings. See target layout below. | `index.html`, `web/shell.js`, `web/room-tabs.js`, `web/room-live.js` |
| 6 | Visuals | The room diagram exists only in the Test bench. Live shows machines as a bullet list. Home cards have no trends. | designer | high | Reuse `.mimic-svg` on the room Overview, or machine tiles; 24 h sparklines with a target band on cards | `web/simulator.js` → `web/room-live.js`, `web/charts.js` |
| 7 | Type | Fonts never load (no `@font-face`), so the page falls back to system sans plus typewriter mono. 12 different text sizes. | designer | high | Load the fonts or use a system stack; mono only for numbers; scale 12/14/16/20/24/32 | `styles.css:3-5` |
| 8 | Forms | Native inset controls. Batches inputs overlap and the page scrolls sideways on a phone (421 px in 390). Buttons touch. A link sits inside a button. Rules are written as sentences with inline inputs. | both | high | One `.field` (label above, 38 px, `width:100%; min-width:0`, unit suffix) and `.btn-row{gap:8px}` | `styles.css`, `web/harvest.css .bt-form` |
| 9 | Errors | Status and errors in 12 px grey mono `.tag`. Raw API errors ("Invalid batch: block_wet_kg: required"). | both | high | `.alert` (info/success/error) next to the action. Plain errors on each field. | `web/batches.js`, `web/rooms.js`, `web/room-simulate.js` |
| 10 | Setup | "New room" asks only for name and m³. An empty name gives "Room N". Blocks need Batches → wet weight → save (the batch then hides under another tab) → Place in room: 5 screens. | farmer | high | One Add-room form: name, mushroom, stage, blocks. Make wet weight and moisture optional with defaults. Jump to the batch after saving. | `web/rooms.js #rhCreate`, `web/batches.js` |
| 11 | Data loss | Unsaved setting changes are lost silently when leaving the page. | farmer | med | "Save changes?" when leaving the page | `web/shell.js route()`, `web/room-live.js` |
| 12 | Buttons | Everything is outline. Disabled looks enabled. Fit is disabled with no reason given. | designer | med | `.btn-primary` (copy `.hv-add`), `.btn-danger`, `.btn:disabled{opacity:.45}`, reason shown inline | `styles.css` |
| 13 | Wording | IN BAND, ppm, purge, SF-203 + EF-206, TT-101, Fogger, Setpoint, BE %, Cleared, Installer | farmer | med | See the wording table below | many |
| 14 | Simulate | An empty crop mix runs and is saved as "Impossible". Duplicate crops are allowed. The equipment check says "BUY THIS" for the size the user already owns. "Run a full cycle (83 days)" sounds like 83 days of waiting. | both | med | Disable the run with the reason. Filter out crops already chosen. "Keep your 1.5 hp." "Simulates 83 days in ~30 s." | `web/room-simulate.js`, `web/room-equipment.js` |
| 15 | Charts | 6 h trend with 10 min of data is a grey block plus a 2 px stub. Full-cycle chart has no day/stage axis. Power chart has zig-zag artifacts. | designer | med | Window = data span, or "first trend in ~50 min". Day axis with stage bands. Remove the separator strokes. | `web/charts.js` |
| 16 | Equipment | "Is my fan/mister working?" can't be answered: no last-ran time, no fault, no test button. The equipment check is about what size to buy. | farmer | med | "Mister: last ran 10:02 ✓". Manual flag. Test button (installer). | `web/room-live.js` |
| 17 | Access | Test bench, Simulate, Calibrate, versions and codes are open to the farmer view. Reset has no confirm. | farmer | med | Hide behind Installer (PIN). Confirm Reset. | `web/shell.js`, `web/simulator.js` |
| 18 | Shell | Scroll position is kept across pages. Header uses ~270 px on a phone. Hit targets are 29–31 px; checkboxes are 16 px. | both | med | `scrollTo(0,0)` in `route()`. Compact header. 44 px touch targets. | `web/shell.js`, `styles.css` |
| 19 | Results | Each Simulate run replaces the last; results are long prose. | designer | med | One result card per run kind: headline, chart, details collapsed | `web/room-simulate.js` |
| 20 | A11y | ✓ at 3.07:1 contrast; muted 12 px text at 3.77:1. Dates show mm/dd/yyyy. | designer | low | `--good-text` colour at 4.5:1 or better; `lang="en-MY"` | `styles.css`, `index.html` |

## Where to visualize

| Today | Where | Visualize as |
|---|---|---|
| Nothing | Home | KPI row: rooms in band, alarms, kWh/RM today, kg this week, next harvest |
| Numbers plus chips | Room cards | 24 h sparklines with a target band; machine-state strip |
| Bullet list of machines | Room Live | Room diagram (already built in the Test bench) or machine tiles |
| Event log text | Live | Machine on/off timeline strips under the trends |
| "Holds 3,652 blocks; you plan 2,000 (55 %)" | Simulate → Capacity | Bullet chart with too-empty / good / tight / too-dense zones |
| 9×11 stage table | Simulate → Full cycle | Cycle Gantt: stage bands, flush markers, energy bars |
| Aircon sizes table | Equipment check | Grouped bars (% in band, RM/block per hp); owned unit highlighted |
| Flushes table | Batch detail | Kg per flush bars plus a cumulative yield line |
| Batch list | Batches | Board (New → Growing → Finished) or a room-occupancy timeline |
| 16-column rule table | Test bench 24 h test | Bars showing the difference from "Your rules" |

## Target layout (designer)

```
+--------------------------------------------------------------------------+
| [logo] Mushroom farm       ⚠ 1 alarm   ○ SIMULATED (no sensors)   ⚙  (?) |
+-------------+------------------------------------------------------------+
| ▣ Overview  | Overview                                  [+ New room]     |
| ▢ Rooms   3 | Your farm today · Mon 12 Oct                                |
| ▢ Batches 2 | [In band 3/3 ✓] [Alarms 0] [Energy 19 kWh RM10.9] [Harvest 25 kg ▁▃▅] |
| ▢ Harvest   | +-------------------+ +-------------------+ +-----------+  |
| ─────────── | | Room 1 ✓ All good | | Room 2 ⚠ Too hot  | | Room 3 .. |  |
| ▢ Plan      | | SIMULATED         | | MANUAL aircon     | | Lion's    |  |
| ▢ Test bench| | 25.2°C ▁▂▂▁ 87% ▃▂| | 26.5°C ▁▂▅ 87% ▃▂ | | mane      |  |
| ─────────── | | [Record harvest]  | | [Record harvest]  | | Pinning d2|  |
| ⚙ Settings  | +-------------------+ +-------------------+ +-----------+  |
|             | Batches timeline              Recent events                |
+-------------+------------------------------------------------------------+
Room:   Overview / Rooms / Room 1  [SIMULATED]  [⋯ rename, archive]
        [ Overview | Settings | Simulate | Calibrate | Batches ]
        Overview = diagram or machine tiles, 3 trends, alarms, event timeline
        Settings = crop & targets, rules (installer), machines, versions, sticky Save
Phone:  bottom tabs  Overview · Rooms · Batches · Harvest · More
```

| Nav item | Contains | Replaces |
|---|---|---|
| Overview (home) | KPI tiles, room cards with sparklines and Record harvest, batch timeline, events, first-run checklist | Rooms home intro and cards |
| Rooms → Room → Overview | Diagram or tiles, trends, alarms, timeline | Top half of `#/rooms/:id/live` |
| Rooms → Room → Settings | Crop & targets, rules, machines, versions, sticky Save | Bottom half of the Live tab |
| Rooms → Room → Simulate / Calibrate | Result cards with charts (installer) | Same routes |
| Batches | Status board, New-batch drawer, yield chart | `#/batches` |
| Harvest | Today's weigh-ins, stickers | `#/harvest/stickers` |
| Plan | Farm-level capacity, what to buy | Capacity part of Simulate |
| Test bench | Sandbox with SANDBOX banner (installer) | `#/simulator` |
| Settings | Installer mode (PIN), theme, tariff, region | Header toggles, run-bar tariff |

## Wording for the farmer view

| On screen | Use |
|---|---|
| IN BAND / ABOVE BAND / OUT OF BAND | OK / Too hot / Check |
| CO₂ ppm, BELOW LIMIT | Fresh air: OK |
| Purging | Fan blowing out stale air |
| Air exchange, SF-203 + EF-206 | Fresh-air fans |
| TT-101, MT-102, AT-103, OT-104 | Room thermometer, Outside |
| Fogger | Mister |
| Setpoint | Set to |
| Band ±1 °C, alarm at ±2 °C | OK between 24 and 26 °C |
| Farmer / Installer | Simple / Expert (PIN) |
| Strain, Source, BE % | Seed type, Bought from, Yield % |
| Received / In rooms / Cleared | New / Growing / Finished |
| Clear (button) | Finish batch |
| virtual room, Calibrate, predicted vs real | Hide from the farmer view |
| Keep as is | Spawn run, Pinning, Fruiting, Rest, Flush, crates, kg |

## Form rules

| Rule | Example fix |
|---|---|
| Label above, full-width control, help below | `.field{display:grid;gap:4px} .field :is(input,select){width:100%;min-width:0;height:38px}` |
| Units as an input suffix | `[ 0.57 │ RM/kWh ]` |
| One filled primary action per form | Copy `.hv-add` from the harvest page |
| Spaced button groups | `.btn-row{display:flex;gap:8px;flex-wrap:wrap}` |
| Plain-language errors on each field | "Enter how many blocks arrived" under Blocks |
| No meaningless submits | Disable with the reason inline |
| Group by task | Batch: Blocks · Dates · Notes |
| Rules as labelled fields, not sentences | "Delay purges below [85 %]" |
| Long jobs state duration and progress | "Simulates 83 days in ~30 s" |
| Warn before losing changes | "Save changes?" when leaving |

## What's already good (keep)

| Item | Why |
|---|---|
| Phone harvest page (`#/harvest/:id`) | Big fields, one filled button, accepts "12,5", Undo. Use it as the pattern for every form. |
| Save plus confirm box for setting changes | "25 °C → 16 °C" with Cancel prevents accidents |
| Breadcrumb, room header, room tabs | A real start on a standard shell |
| Stage words (Spawn run, Pinning, Fruiting) | The farmer's own language |

## Suggested order

| Wave | Items | Size |
|---|---|---|
| 1. Quick wins | Fonts; `.field` / `.btn-primary` / `.btn-row` / `.alert`; Batches overlap; SIMULATED badge; amber out-of-band plus MANUAL flag; Record-harvest button on cards; plain errors; scroll reset; leave-page warning; block empty submits | ~1–2 days |
| 2. Layout | Sidebar shell plus phone bottom tabs; Overview home with KPIs, sparklines and first-run checklist; split Live into Overview and Settings; installer items behind a PIN; farmer wording | ~1 week |
| 3. Visuals | Room diagram on the room page; machine timeline; capacity bullet chart; cycle Gantt; flush yield chart; batch board | ~1 week |
| 4. Setup flow | One Add-room form (mushroom, stage, blocks); crop-matched targets with ramp ETA and range warnings | ~3 days |

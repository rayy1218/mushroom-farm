# Pictures: crops, stages, machines, sensors and tasks (iteration 20)

Date: 2026-11-03 · Branch `v2` · Builds on the redesign (2026-10-28, DESIGN.md), the room drawing (2026-10-20, 2026-10-26) and
Tasks (iteration 19).

The owner said (2026-11-03) "the app is lacking a lot of visual image". The app had no raster image at all; its only pictures
were the charts, the room drawing, the theme button and the task ticks, so every crop, machine and task was words only. The
owner chose every row marked *owner*; the lead chose the rest. Drafts and screenshots: `.impeccable/mocks/pictures/`,
`~/.claude/task-logs/imagery/`.

## 1. Scope

| In | Out (later) |
|---|---|
| A picture per crop (9), per crop and stage (the grow bag as it looks now), per machine (8), per sensor and module (8), per task rule (25 + own, long-term, generic) *owner* | Photographs; a worker's photo on a task |
| Flat drawings in the room drawing's world: white units, the blocks' tan, each crop in its own hue, no outlines *owner* (style examples approved 2026-11-03) | Moving pictures (the room drawing stays the one animated picture) |
| The Overview room card shows the room's crop and stage with its bag picture *owner* | A mini room drawing on the Overview (the owner chose crop and stage) |
| The Today page, the Now tab's Crop card, the Crop tab, the crop editor, the Machines list, the Equipment cards, the task rows and the Task rules | Alarms, the Log table, History, Simulations and Suggest machines (words and charts only) |
| The crop summary in `GET /api/overview` and `GET /api/tasks/today` (the Overview and Today show the crop) | |

## 2. The Picture Rule (DESIGN.md)

| Rule | Detail |
|---|---|
| Names, never states | A picture says what a thing is (a crop, its stage, a machine, a task). It never says how it is: no green, amber, red or accent blue in any picture, no picture that changes with a reading or a machine's state. The pills and words keep the state. |
| Never alone | Every picture sits beside the words that say the same; it is `aria-hidden`. Nothing is learnt only from a picture. |
| One drawing world | 48 × 48 grid, flat fills, thin detail lines only where a shape needs them (gills, pleats), the room drawing's palette: white units (`--p-unit`), the blocks' tan (`--p-bag`), each crop's two hues (`--c`, `--c2` from `--p-<crop>`, `--p-<crop>-2`). |
| Mirror | Every picture token is in both theme blocks of `web/styles.css` (the Mirror Rule); light gives white units a 1 px `--p-edge`. |
| Sizes | 24, 32, 40, 48, 64 or 96 px only; each picture is checked at 32 px in both themes. |
| Neutral icons stay | The line icons (top bar, Crop tab target icons) stay as they are: pictures are things, icons are commands and labels. |

## 3. Where the pictures go

| Place | Picture | Size (desk / phone) | Beside |
|---|---|---|---|
| Overview room card | the main crop's picture (built: the bag drawn small lost the crop's form, so the stage is said in words) | 40 / 40 | under the room name: "Grey oyster · Fruiting · day 7 of 7" (*owner*); no crop: a dashed 40 px tile and "No crop" |
| Today page, each room's heading | the main crop's picture | 32 / 32 | the room name, the crop line under it |
| Now tab, Crop card | the main crop's picture | 48 / 48 | the crop name and stage |
| Crop tab, the head | each crop's picture | 64 / 48 | "Grey oyster · 600 blocks"; a mixed room shows each crop's picture, overlapped by a quarter |
| Crop tab, each stage card | the main crop's bag in that stage | 48 / 40 | the stage's name and length |
| Now tab, Machines list | the machine | 32 / 28 | between the air-order number and the name |
| Setup, Equipment cards | the machine or sensor | 40 / 40 | the card's title; not on a card shown under another part's title (the Intake filter's Settings) |
| Task rows (Tasks tab, Today) | the task's rule picture; harvest tasks hold the room's main crop | 32 / 28 | after the round tick, before the name |
| Settings, Task rules | the rule's picture | 24 / 24 | the rule's name |

The crop editor (Edit crops) has no pictures: its rows share their grid with Simulate's crop rows, and the Crop tab's head
shows each crop's picture once saved. The main crop: the room's crop with the most blocks (the first on a tie). A rule without a picture (an older or unknown key)
takes `generic`; an own rule takes `own`; a long-term task takes `longTerm`.

## 4. The server

| Reply | Adds | Shape |
|---|---|---|
| `GET /api/overview`, each room | `crop` | the crop reply of `GET /api/rooms/:id/crop` without `targets` (the page uses `cropSummary` and `stageDay`, as the Now tab does: one rule for the day) |
| `GET /api/tasks/today`, each room | `crop` | the same |
| `GET /api/rooms/:id/tasks` | `crop` | the same (the harvest pictures on the Tasks tab) |

No database change.

## 5. The code

| Part | Detail |
|---|---|
| `web/pictures-data.js` | Pure: `markup(kind, key, { crop, stage })`, `hues`, `taskPicture`, `equipmentPicture`, `machinePicture`, over `web/pictures-crops.js` (`CROPS`, `CROP_HUES`, `bag(cropKey, stage)`), `web/pictures-machines.js` (`MACHINES`, `SENSORS`) and `web/pictures-tasks.js` (`TASKS`). Tested in Node. |
| `web/room-card-math.js` | `mainCrop(crops)`, `cropLine(crop)` ("Grey oyster · Fruiting · day 7 of 7", "No crop"); `cropSummary` carries `crop`. |
| `web/pictures.js` | `picture(kind, key, { size, crop })` → an `<svg class="pic">` (viewBox 0 0 48 48, `aria-hidden`, the crop's `--c`/`--c2` set on it). |
| `web/styles.css` | The `--p-*` tokens in both theme blocks; `.pic` (block, no shrink). |
| Tests | Every crop in `web/crops.js`, every rule in `server/task-rules.js`, every machine and sensor the Equipment tab lists has a picture; no picture markup holds a hex colour or a state token (`--good`, `--warning`, `--critical`, `--accent`); every `--p-` token a picture uses is defined in both theme blocks; the server replies carry `crop`. |

## 6. Done when

All of section 3 shows in both themes at 1440 and 390 px, the pictures read at 32 px, the Impeccable detector is clean on the
changed files, a finish review has passed and DESIGN.md has the Picture Rule.

# The Crop tab as a stage plan (iteration 14)

Date: 2026-10-26 · Branch `v2` · Replaces the layout of the Crop and stage card (spec 2026-10-20-crops-and-simulation-design.md 3.5); the server, its API (GET / PUT `/api/rooms/:id/crop`) and the program rules do not change.

The owner showed another farm app's stage page (each stage in turn with its length and its target ranges, a Select stage button on each, a list of stages down the side with the current one marked) and chose "Redesign the Crop tab". Everything the card does today stays possible: set the crops and blocks, the farm type, start a stage (with or without the slow change of the bands), the days of each stage, the flushes, the ramp hours, automatic change, new blocks in a done room.

## 1. Layout

| Part | Rule |
|---|---|
| Head | the crops ("Lion's mane · 950 blocks"; two crops "Grey oyster 300 + Golden oyster 200 blocks") and the farm type ("Ready-to-fruit blocks (bought in)"), an **Edit crops** button right. No crops: "No crop set: the bands are set by hand" and **Add crop** (opens the same editor) |
| Crop editor (Edit crops / Add crop) | inline under the head: the crop rows (crop, blocks, Remove, Add crop), the farm type, Save and Cancel; the checks and wording of today's form (`checkCropForm`, `saveBody`); a done room offers "New blocks" as today (`newBlocksBody`). Closed after a good save |
| Stages (main column) | one section per stage of the farm type, in order (ready: Fruiting, Rest between flushes; full: Spawn run, Pinning, Fruiting, Rest between flushes) |
| Stage section | the stage's name; its length ("7 days"; Fruiting "7 days × 4 flushes"); a mark: **Current · day 2 of 7 · flush 1 of 4**, **Next · about 2 Nov 09:55**, or nothing; the warnings of the crops' ranges for that stage; **Start this stage** (not on the current stage) and a pencil to edit its days (and, on Fruiting, the flushes); a **Targets** table |
| Targets table | rows with an icon, a name and the value, from `mixBands(crops, stage).bands` of `web/crops.js`: Temperature `tLow–tHigh °C`, Humidity `rhLow–rhHigh %`, CO₂ kept between `co2Low–co2High ppm`, CO₂ safety level `co2Safety ppm` (grouped thousands). On the current stage while the bands move: the ramp line under the table ("Bands moving to fruiting, ready about 14:42") |
| Stages list (right column, sticky) | "Stages", then the plan from the current stage on, as a vertical line with the current entry marked: each entry its stage name (with "flush N" for fruiting and rest) and its dates ("26 Oct → 2 Nov"); fruiting and rest repeat until the last flush; entries before the current one are shown as done without dates; a done room: every entry done and "Replace the blocks". Clicking an entry scrolls to its stage section |
| Program row (under the stages, or under the list on a phone) | Ramp (h) and Automatic change (on/off), each saved like today's fields |
| Phone (card under 720 px) | one column: head, stages list (collapsed to the current and next entries), stage sections, program row |

## 2. Actions

| Action | Rule |
|---|---|
| Start this stage | a confirm: "Start Fruiting now?" with the option "Bands at once (skip the 4 h ramp)" (today's "Bands at once"); then PUT `startBody(stage, applyNow)`; the card and the room's control refresh (`onChange`) |
| Pencil on a stage | its days (1–90) inline, and on Fruiting the flushes (1–10); Save sends only what changed (`saveBody`); errors in the server's words under the field |
| A room without crops | stage sections show their targets for the chosen crops only after crops are set; before that the stage sections are hidden |

## 3. Code

| Item | Rule |
|---|---|
| Files | `web/crop-card.js` rewritten; pure parts in `web/crop-math.js` (new: `stagePlan(crop, now)` → the list entries with dates and states; `stageTargets(crops, stage)` → the table rows; `cropHeadline(crop)`); styles in `web/styles.css` |
| Interface | unchanged: `createCropCard(host, { roomId, onChange, onData, onOffline, onGone })` → `{ refresh(), destroy() }`; `onData` keeps feeding the Room card |
| Refresh | as today: every 30 s and after a save; an open editor or pencil is never replaced by a refresh |
| Tests | `stagePlan` (ready and full farm types, flushes repeating, done room, no automatic change: no dates after the current), `stageTargets` (one crop, two crops mixed, CO₂ grouping), `cropHeadline`; page source checks that the card uses `startBody`, `saveBody`, `newBlocksBody`; npm test all passing |
| Browser check | a throwaway farm app and device app: a ready room in fruiting, a full-cycle room in spawn, a done room, no crops; desktop and phone, dark and light |

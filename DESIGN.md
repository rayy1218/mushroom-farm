---
name: Mushroom farm
description: Climate and harvest. A climate-controller dashboard for one farm's grow rooms, read at a desk and at the room door.
colors:
  page: "#0d0f12"
  surface: "#15181c"
  raised: "#1c2026"
  ink: "#e9ebee"
  ink-2: "#b6bcc5"
  muted: "#8a919b"
  border: "rgba(255,255,255,.075)"
  border-strong: "rgba(255,255,255,.13)"
  band: "rgba(255,255,255,.05)"
  grid: "#23272d"
  axis: "#3b414a"
  accent: "#336fe6"
  accent-hover: "#2f68dd"
  accent-soft: "rgba(77,141,255,.14)"
  accent-text: "#7fb0ff"
  on-accent: "#ffffff"
  good: "#2eb872"
  good-text: "#3fcf85"
  good-soft: "rgba(46,184,114,.14)"
  warning: "#e3a008"
  warning-text: "#f2bd4b"
  warning-soft: "rgba(227,160,8,.14)"
  critical: "#d63c42"
  critical-text: "#ff8085"
  critical-bg: "rgba(229,72,77,.13)"
  series-temperature: "#f39a5b"
  series-humidity: "#3cb4f0"
  series-co2: "#a98bfa"
  series-energy: "#c9b26a"
  series-water: "#4fc1b0"
  page-light: "#f4f5f7"
  surface-light: "#ffffff"
  raised-light: "#f7f8fa"
  ink-light: "#12151a"
  ink-2-light: "#434a55"
  muted-light: "#687080"
  accent-light: "#2563eb"
  accent-text-light: "#1d4fd8"
  good-text-light: "#15803d"
  warning-text-light: "#a35a00"
  critical-light: "#dc2626"
  critical-text-light: "#b91c1c"
  series-temperature-light: "#dd6b20"
  series-humidity-light: "#0284c7"
  series-co2-light: "#7c3aed"
  series-energy-light: "#8a7425"
  series-water-light: "#0f8f80"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\", \"cv11\", \"ss01\""
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
  card-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"cv11\", \"ss01\""
  small:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  control: "8px"
  card: "12px"
  segment-track: "10px"
  segment: "7px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-danger:
    backgroundColor: "{colors.critical}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
  switch-off:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "4px 12px"
    height: "36px"
    width: "64px"
  switch-on:
    backgroundColor: "color-mix(in srgb, #336fe6 24%, transparent)"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "4px 12px"
    height: "36px"
    width: "64px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "20px"
  reading-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px 18px 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "40px"
  segmented:
    backgroundColor: "{colors.band}"
    rounded: "{rounded.segment-track}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.segment}"
    padding: "4px 14px"
    height: "30px"
  pill-running:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-good:
    backgroundColor: "{colors.good-soft}"
    textColor: "{colors.good-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-fault:
    backgroundColor: "{colors.critical-bg}"
    textColor: "{colors.critical-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-off:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  tab:
    textColor: "{colors.muted}"
    padding: "10px 12px"
  tab-active:
    textColor: "{colors.ink}"
---

# Design System: Mushroom farm

## Overview

**Creative North Star: "The Control Room, Played Straight"**

The farm app is a climate-controller dashboard in the category standard: a neutral dark ground, one blue accent, status colour that means something, and numbers set like instruments. It sits beside Grafana, Home Assistant, Vercel/Linear and Ubiquiti UniFi, the four products the owner named as the craft bar, and it aims at their finish rather than at a look of its own. A room's state has to be legible in one glance, at a desk or on a phone at the room door, so decoration never stands in for state.

Density is moderate and calm: cards on a quiet page, hairlines rather than boxes, a tight type scale with tabular figures, plain English and metric units in every line. Colour is spent on state and, by a deliberate exception, on the identity of the three measured quantities. Dark is the default (the owner's choice); a light theme mirrors it token for token.

Scope: only the room page (`#/rooms/:id` with its Now, History, Crop, Simulations and Setup tabs) was rebuilt in this world. The Overview, the Rooms list, Settings and the simulation run pages already use these tokens (colours, type, radii, buttons, cards) but keep their older layouts; bring them into the layouts and rules below when they are next worked on.

**Key Characteristics:**
- Neutral dark ground (`page` under `surface` cards), light theme mirroring it.
- One blue accent: selection, the primary action, and "running".
- Green in band, amber warning, red fault; series hues only on temperature, humidity and CO₂ traces.
- One card level; hairline-separated sections inside a card.
- Inter, self-hosted, with tabular figures and a tight scale (12 to 32 px).
- Status pills, segmented controls, underline tabs.
- Metric units, plain English, one number format everywhere.

## Colors

A neutral grey ladder with one blue and three state colours; three series hues are the only other colour on the page.

### Primary
- **Signal Blue** (`accent`; light `accent-light`): the selected tab's underline, the one filled button on a view (Send, Save), the running dot and "On" pill, the current crop stage and its day-progress bar, and focus rings. Text in blue uses `accent-text`; white on the dark-theme fill is 4.6:1.

### Secondary (state)
- **In-Band Green** (`good`, `good-text`, `good-soft`): a reading inside its band, the Live dot, a sensor online, a saved confirmation.
- **Warning Amber** (`warning`, `warning-text`, `warning-soft`): a warning alarm, a reading drifting toward its edge, unsent edits, a room running hand-changed bands.
- **Fault Red** (`critical`, `critical-text`, `critical-bg`): a fault, an alarm at serious or critical level, a machine not doing what it was told, a reading out of band, invalid input, destructive actions.

### Tertiary (series)
- **Temperature Ember** (`series-temperature`), **Humidity Sky** (`series-humidity`), **CO₂ Violet** (`series-co2`): each quantity's trace on its Now reading card (with its band shaded at 13 % of the same hue) and its line on the History charts.
- **Energy Brass** (`series-energy`, `--s-energy`) and **Water Teal** (`series-water`, `--s-water`): the electricity and water bars and lines (History, the energy cards, a simulation's per-day bars). They are their own quantities, so they never borrow the climate hues.

### Neutral
- **Night Page** (`page`): the page behind the cards; the sticky Setup links bar on a phone.
- **Panel** (`surface`): cards, dialogs, inputs, the selected segment, the top bar (at 88 % with an 8 px blur).
- **Raised** (`raised`): resting buttons and the room switcher.
- **Ink / Ink 2 / Muted** (`ink`, `ink-2`, `muted`): values and titles; secondary text and labels; hints, units, timestamps and unselected tabs.
- **Hairline / Strong Hairline** (`border`, `border-strong`): card edges and section rules; control borders and dashed empty states.
- **Band** (`band`): the segmented track, hover fills, the Off pill, bar tracks.
- **Grid / Axis** (`grid`, `axis`): chart gridlines and axes; quiet link underlines.

### Named Rules
**The State-Only Colour Rule.** Everywhere outside the measured series, colour means state: blue is selection, primary action and running; green is in band; amber is warning; red is fault. Icons, headings, links in prose and target labels stay neutral (the Crop tab's target icons are `muted`). The pictures (below) are the one other exception: they draw things in the room drawing's own colours, never a state colour.

**The Series Identity Rule.** (2026-10-28: energy and water have their own hues too.) Temperature, humidity and CO₂ keep their own hues (`--s-t`, `--s-rh`, `--s-co2`) on the reading-card traces and the History charts. This deliberately adapts the category standard's "nothing else coloured": the hue carries a metric's identity from the Now tab to the History tab, which is a data job, not decoration. A series hue never marks state, never fills a button and never colours text other than a chart's own legend. (2026-11-03, owner: "icon") Each reading also has a line icon in its hue beside its name, the same everywhere: a thermometer, a drop, CO₂ bubbles (`web/icons.js`) on the Now tab's reading cards, the Overview's room cards, the History charts' titles and the Outdoor card, where dew point (no chart) takes `ink-2`. (2026-11-04) Harvest kg has its own hue too, `--s-harvest`, a muted ochre (dark `#b8844e`, light `#a87a4c`): the bars of the Harvest page's chart and the Overview card's strip, never state, never text.

**The Mirror Rule.** Dark is the default (`data-theme="dark"`, stored per browser); the light theme redefines every token under the same name and adds nothing else except a 1 px card shadow. A new colour means a new token in both theme blocks.

## Typography

**Display Font:** Inter (variable, 100 to 900, served by the app itself from `/inter.woff2` because the farm LAN may have no internet), falling back to system-ui
**Body Font:** Inter
**Label/Mono Font:** Inter; no mono face

**Character:** One modern neutral sans throughout, with Inter's single-storey a and open digits (`cv11`, `ss01`) for calmer data and tabular figures wherever numbers line up.

### Hierarchy
- **Display** (600, 32 px, 1.1, -0.02em, tabular): the live value on a reading card; 28 px on a phone.
- **Headline** (700, 24 px desktop / 20 px phone, 1.15, -0.02em): the page title (the room's name).
- **Title** (600, 20 px): a Setup part's title, a large status value on equipment cards, the crop name on the Crop tab.
- **Card title** (600, 14 px): a card's head ("Control", "Machines"); 16 px for `h2` in older layouts and stage names.
- **Body** (400, 14 px, 1.45): rows, descriptions, form text; hints capped near 60 ch.
- **Small** (400 or 500, 13 px): bands, sub-lines, notes, the tab row on a phone.
- **Label** (600, 12 px): pills, status chips, legends, step numbers. Sentence case, no tracking.

On screens up to 600 px the three smallest steps grow by 1 px (13, 14, 15) for reading at the room door.

### Named Rules
**The Tabular Figures Rule.** Every number that can change or line up (readings, bands, kWh, RM, timestamps, table cells) sets `font-variant-numeric: tabular-nums`.

**The Near-Edge Rule.** (2026-10-28, owner: amber on a reading the machines were holding taught people to ignore amber.) A temperature or humidity in band but within 15 % of the band's width of an edge is amber only when the machine that should act is not acting, or when the reading has stayed near that edge for 15 min (its trace tells); otherwise it shows the calm "In band". The machine that should act: humidity low, the humidifier; humidity high, a fitted dehumidifier (or the humidifier, which should have stopped); temperature high, the aircon cooling; temperature low, the aircon not cooling. (2026-10-29) A machine that has not reached its own switch point is acting as told: humidity near low counts as not acting only at or under the humidifier's on-point with the humidifier off, humidity near high only at the band's top (the dehumidifier's on-point) with the dehumidifier off, or at or over the humidifier's off-point with the humidifier still on. A machine the room does not have (or not known) never counts as not acting, so such a reading turns amber only after 15 min there. The words fit one line: "Near low", "Near high", with "· falling" or "· rising" when the trend runs toward that edge (web/band-math.js `nearChip`, the same on the Overview and the room page). Out of band is amber, a fault red. (2026-10-29, owner: "OK" beside an amber "Near high" read as a contradiction.) On the Overview a room with no alarm, nothing out of band and in Auto but with an amber near-edge reading takes an amber "Watch" pill, not "OK"; it does not count as needing attention, and the status line names it ("3 rooms OK · Room 1 humidity near high") or counts several ("2 rooms to watch") (web/overview-math.js `nearEdges`). (2026-10-29, owner: the Overview flapped and reordered as the machines cycled.) The room cards keep one order, by name, whatever their state. The pill and the status line say "Out of band" only once a reading has been out as long as its alarm waits (5 min; humidity over the band 15 min; CO₂ at the safety level 1 min) and "Watch" once it has been near an edge for 2 min; until then, and for 2 min after it is back, the room stays as it was. The reading's own words show at once, without the amber until then (`settleRooms`). On opening the page a reading out of band counts as held only when its last 30 min trace bucket was out of band too (an air exchange wets a room for a few minutes). The status line's polite live region speaks only when its words change.

**The Exchange Words Rule.** CO₂ has no band to stay in: its two numbers are where the air exchange starts and stops, so its status says what the exchange is doing (web/band-math.js `co2Status`, the same on the Overview, the reading card and the drawing). Below the stop point and "Exchange off" are green; "Exchange running" is neutral (`ink-2`), never amber; "Over the start point" with the exchange not running is amber; within 15 % of the gap from the start point to the safety level "Near the safety level" is amber; at the safety level red. On the Overview "Exchange off" carries its start point ("Exchange off · starts at 1,400 ppm"): a high reading with the exchange off is then not read as a contradiction.

**The Units Rule.** Every number on screen carries its unit, the controller's reasons included ("CO₂ 744 ppm between 700 and 800 ppm"), and the reasons compare in words, never in maths signs ("RH 87.9 %, at or under its on-point 88 %", "CO₂ 1,450 ppm, at or over 1,400 ppm"); thousands are grouped (1,000 ppm); a range of dates takes an en dash. A number never parts from its unit at a wrap and a '·' keeps to the words before it, so a wrap leaves it at a line's end and no line starts with '·' (a no-break space before it, a normal one after: web/text-math.js `keepLines`, `DOT`; 2026-10-29c, a line began "· fresh air every 12 min."). An aircon is entered and shown in kW; its BTU/h class (the size shops sell) is a picker and a note in brackets, never the input's unit.

**The By-Hand Rule.** A value a person set that differs from the program (a band changed on Setup) is shown in the accent text colour with the program's own value under it ("stage: 900 ppm") and a way back ("Back to stage values"): a choice, not a warning. Three places say it: the Setup inputs, the Crop tab's current stage and, in a line under the Now tab's Control head, "Bands changed by hand on Setup" with its own Back to stage values (2026-10-29c) (web/crop-math.js `byHandValues`, `stageBody`); while they agree nothing shows.

**The Navigation Rule.** The top bar holds the farm's name, Live, the theme, Today (with its count), Calendar, Harvest, Overview and Settings, and a red alarm button only while there are alarms; on a phone the links are their icons and, with too little room for it (about 400 px wide since Calendar, 2026-11-03), the farm's name shows as its mark alone. (2026-11-04, Harvest: under 400 px the top links and the theme button are 40 px wide and 44 px tall, so six icons fit at 360 px with the mark; under 380 px, while the alarm button shows, the farm's mark is hidden, as there is no room for it.) (2026-11-05, the task grid audit: from 601 to 899 px the five worded links left the mark 22 px under "Live" and the page scrolling sideways at 700 px, so up to 899 px the links are their icons, 44 px wide, the Today count kept, as on a phone; from 900 px they carry their words. With the alarm button showing, 900 to about 1000 px keeps the 28 px mark without the farm's name.) The Overview holds every room (the Rooms list is folded into it) and Add room; a room is reached from its card or the room switch on its page.

**The One Format Rule.** A quantity has one formatter and every tab uses it: humidity and filter pressure to one decimal (91.2 % RH, 40.2 Pa), metric units with a space before them, ranges with an en dash (19–21 °C). If two tabs could disagree about a number, they share the formatter.

## Layout

One sticky top bar (56 px, 61 px on a phone with its 44 px buttons: brand, Live, theme, Settings; `--topbar-h`, which the sticky heads under it and a dialog's top follow) over a single column at most 1400 px wide, padded 24 × 28 px from 900 px up and 14 px below. The room page opens with a head (back link, room name, size line, room switcher at the right) and underline tabs; a phone scrolls the tab row sideways with a fade at the edge that has more. On a phone (2026-10-29c) the room switcher sits beside the back link on one row, the name under them, and the Now tab drops the size line, so the readings start higher.

The Now tab is a two-column grid from 1100 px: a fluid main column (three reading cards in a row, then the room drawing) and a 320 to 400 px side column (alarms, Control with Auto | Manual, Machines in air order, the aircon panel in Manual, Crop). Below 1100 px the columns dissolve into one ordered stack. Setup puts its control form in two columns from 1100 px (48 px gutter) and its Room part on a 2 : 1 grid. Equipment cards auto-fill at 260 px minimum; sensor cards sit two by two above 600 px. The Crop tab switches to one column below a 720 px container width.

Rhythm runs on 4 px: 4, 8, 12, 16, 20, 24, 32. Cards gap 16 px (12 px on a phone); rows inside a card pad 8 to 10 px; Setup parts are 32 px apart with a 24 px top rule. Breakpoints: 600, 760, 900 and 1100 px.

**The Readings First Rule.** On a phone the order is readings, alarms, control, machines, the drawing, then the crop: the question "is the room OK" is answered before any scroll.

## Elevation & Depth

Flat by default. Depth comes from tone (`surface` cards on the darker `page`) and a hairline edge, not shadows. The dark theme uses no card shadows at all; the light theme gives cards a single 1 px soft shadow so white cards separate from the pale page.

### Shadow Vocabulary
- **Card lift, light only** (`box-shadow: 0 1px 2px var(--shadow)`): every `.card` in the light theme.
- **Selected segment** (`box-shadow: 0 1px 2px var(--shadow), 0 0 0 1px var(--border)`): the chosen option in a segmented control.
- **Dialog** (`box-shadow: 0 12px 40px var(--shadow)`): modal dialogs over a 60 % black backdrop.
- **Current-stage ring** (`box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)`): the current stage card on the Crop tab, with its border at 60 % accent.

### Named Rules
**The One Card Level Rule.** There is never a card inside a card. Parts that would nest become cards themselves (each Crop stage, the Stages list and the program row are sibling cards) or hairline-separated sections inside one card (the Control groups, the Machines rows, the Setup status footer as a 1 px top rule, not a box).

## Shapes

Soft, consistent corners: 12 px for cards and dialogs, 8 px for buttons, inputs and selects, 10 px for a segmented track with 7 px segments inside, and full rounding for pills, status dots and Setup link chips. Borders are 1 px hairlines; dashed hairlines mark empty states and machines not fitted. Status is drawn as 6 to 10 px dots, never as glyphs or emoji.

## Components

### Buttons
Quiet and solid: most buttons are neutral, so the one blue button is the obvious next step.
- **Shape:** gently rounded (8 px), 36 px tall, 500 weight.
- **Primary:** `accent` fill, white text. One per view or panel: Send, Save, Add.
- **Default:** `raised` fill, `border-strong` edge, `ink` text; hover mixes 7 % ink into the fill.
- **Danger:** `critical` fill with white text for Delete; `critical-text` on a neutral button for quieter destructive links.
- **Focus:** 2 px `accent` outline, 2 px offset, on every control.
- **Disabled:** 55 % opacity; Save and Reset only look disabled while saving, so focus is never lost.

### On/Off switches
- **Off:** a default button reading "Off".
- **On:** tinted, not filled: `accent` at 24 % behind `ink` text. Tinting keeps the page's primary action (Send, Save) the one filled button.
- **Placement:** in Manual each machine's switch sits on its own Machines row; in Auto the row shows its pill instead.

### Status pills
- **Style:** full-round, 12 px 600, 2 × 9 px padding, tinted background with its own text colour.
- **Tones:** running (`accent-soft` / `accent-text`, with a 6 px dot), good (green), warning (amber), fault (`critical-bg` / `critical-text`), off (`band` / `ink-2`), no data (`muted`). Alarm level chips are outlined in their colour; critical is a solid red fill. An acknowledged alarm that is still active is not faded: its chip turns a neutral outline (`border-strong` / `ink-2`), its text `ink-2`, and its times line says "Acknowledged". An active alarm about a reading puts the value now beside the value that raised it ("· now 84.0 % RH").

### Cards / Containers
- **Corner Style:** 12 px.
- **Background:** `surface`.
- **Shadow Strategy:** none in dark; 1 px lift in light (see Elevation).
- **Border:** 1 px `border`; an alarm card takes its worst active alarm's colour (`warning-text` for warnings, `critical-text` from serious up); a reading out of band uses `critical` with an inset 1 px ring, a warning reading amber at 55 %.
- **Internal Padding:** 20 px (16 px on a phone). A card head puts a 14 px 600 title at the left and a quiet `muted` note or a control at the right.

### Reading card (signature)
The Now tab's three cards: the quantity name (13 px `ink-2`) with its status word at the right (green, amber or red), the value in Display type with a `muted` unit, the band in Small type, then a 36 px trace of the last hour in the quantity's series hue with its band shaded behind it. On a phone the value and trace sit side by side.

### Inputs / Fields
- **Style:** 40 px tall, 8 × 10 px padding, `surface` fill, `border-strong` edge, 8 px radius; labels 600 above the field.
- **Focus:** 2 px `accent` outline.
- **Error:** border and message in `critical-text`; the field stays in place (sibling fields share label, input and error rows).
- **Check:** a value that is allowed but unlikely (a harvest pick over 0.3 kg a block): border and message in `warning-text`, not `aria-invalid` (a question, not a fault), the message still announced (the box's description, `aria-live`); the primary button reads "… anyway" ("Record anyway") and the same value sent again is kept, a changed one checked again.

### Segmented control
Auto | Manual and the History range choice: a `band` track with a hairline, unselected options `muted` text on nothing, the selected option on `surface` with `ink` text and the selected-segment shadow. A line under it says in plain words what the choice means.

### Navigation
- **Top bar:** sticky, translucent `surface` with blur and a hairline bottom; brand mark and name at the left, Live (green dot when live), the theme button (a sun or moon SVG showing the theme it switches to) and Settings at the right. On a phone the subtitle and the Settings word hide.
- **Underline tabs:** 500 weight, `muted`; hover and current turn `ink`; current carries a 2 px `accent` underline on the row's hairline. A tab with a live problem shows a 7 px amber or red dot.
- **Setup links:** round outlined chips; on a phone they stick under the top bar while Setup scrolls. On a phone Setup's and History's links say short words (Bands, Equipment, Filter, Room; Climate, Energy, Exchange, Machines) so all four fit at 360 px, and a strip fades only at an edge that still hides a link.

### Machines list
The machines in the order the air meets them, numbered, one row each: name (500), a `muted` sub-line saying what it does and why ("Adds moisture · On at 88 % RH, off at 92 % RH" for a band of 87–93 % RH: the humidifier switches inside the band, web/band-math.js `humidifierPoints`), and a state pill or, in Manual, the On/Off switch. A machine not doing what it was told turns its row text `critical-text` and keeps its fault pill beside the switch.

### Line charts
History's and a simulation's charts are one component (web/chart.js), drawn at the card's own pixel width. The y axis is numbered at 3 to 6 round values (1, 2, 2.5 or 5 times a power of ten, one every 28 px or more of plot) with a grid line at each, thousands grouped ("1,000"); the bar charts (Usage, Exchange, Harvest) run their axis to the first multiple of the same steps at or over the peak (25.3 gives 0, 10, 20, 30; 290 gives 300), and counts keep whole steps. The band is a shaded zone with dashed limits; its two numbers sit at the left end inside the plot, the top one over its line and the bottom one under it (turned to the other side rather than leave the plot), on a backing of the card's colour, and an axis number on the same row is left out (`bandLabels`). A band that moved is numbered by its values at the left end too. The outdoor line is dotted in the chart's hue at 55 %, under the band's shading and the room's line, on its own scale numbered alone at the right edge (not on a phone, where its legend gives its latest value).

### Room drawing (mimic)
The room's picture keeps its representation: the air path, the condenser outside, the machines in air order and the shelves of blocks, drawn as flat shapes with one colour per thing (no gradients, shadows or hatching). Its palette is neutral slate (`--m-*` tokens in `mimic.css`, set per theme on the host) with blue (`--m-run`) for running fans and "On" labels; the drawing's own representational colours (cool and warm air, mist, light, the blocks) stay as they are. It sits in a card with 10 px clipped corners and no frame of its own, except in the light theme, where a 1 px `border-strong` line inside its edge keeps the pale sky from melting into the white card; on a phone the whole drawing fits the card's width (2026-10-29: at its own size it was mostly sky until swiped), and under 640 px of picture its labels hide because the Machines list and the readings say them in words. Under 480 px of screen (2026-10-29c) it folds, closed, under "Show the room drawing": that small, it says nothing the Machines list does not; wider screens show it with no fold.

### Pictures
(2026-11-03, owner: "the app is lacking a lot of visual image"; spec `docs/superpowers/specs/2026-11-03-pictures-design.md`.) Flat drawings in the room drawing's world name the things the farm works with: each crop (9), the grow bag in each stage, each machine and sensor, each task rule (`web/pictures.js`, markup in `web/pictures-data.js` and its three parts). A 48 × 48 grid, flat fills, thin detail lines only where a shape needs them (gills, pleats); white units (`--p-unit`, a 1 px `--p-edge` in the light theme), the blocks' tan (`--p-bag`), each crop in its two hues (`--p-<crop>`, `--p-<crop>-2`, set on the picture as `--c`, `--c2`). The `--p-*` tokens sit in both theme blocks of `web/styles.css`.

| Place | Picture | Size (desk / phone) |
|---|---|---|
| Overview room card, Today's room heading | the main crop (most blocks), with "Grey oyster · Fruiting · day 7 of 7" under the name; a dashed tile and "No crop" without | 40 / 40, 32 / 32 |
| Now tab Crop card; Crop tab head | the main crop; every crop, overlapping by a quarter | 48 / 48; 64 / 48 |
| Crop tab stage cards | the main crop's bag as it looks in that stage | 48 / 40 |
| Machines list | the machine, between its air-order number and its name | 32 / 32 |
| Equipment cards | the machine or sensor beside the card's title | 40 / 40 |
| Task rows (Tasks tab, Today); Task rules | the rule's picture after the tick (a harvest holds the room's crop); beside the rule | 32 / 28; 24 / 24 |

**The Picture Rule.** A picture says what a thing is, never how it is: no green, amber, red or accent blue in it, nothing in it changes with a reading or a machine's state (the pills and words keep the state), and it always sits beside words that say the same, so it is `aria-hidden`. A closed task's or an unfitted machine's picture fades with its words. A test checks that every crop, rule, machine and sensor has one and that no picture holds a fixed colour or a state token.

### Calendar
(2026-11-03, owner: "task in calendar"; spec `docs/superpowers/specs/2026-11-03-calendar-design.md`.) `#/calendar`, in the top bar between Today and Overview: a month card (Monday first, six weeks, ‹ Today › at the right of the month's name) and the picked day's card beside it from 1100 px, under it below. A day is a hairline button: its date (today ringed in the accent, the picked day on `accent-soft`), up to three 20 px pictures, what changes first: a stage starting as its bag, then upkeep and stage tasks, then one harvest basket for every room harvesting (in their crop when they grow the same) and "+N"; on a phone one neutral dot per picture (up to three), so a plain harvest day is one dot. A task missed that day, or upkeep overdue today, is one amber dot, the grid's only colour; the day's name says it ("a task missed"). The day's card lists each room (its crop picture), a stage start, the rows by Morning, Afternoon and Any time with their pictures, upkeep, and the routine folded under "+ 4 daily tasks"; closed rows say who and when as the Log; a room whose dates rest on an automatic stage change says "Dates estimated from the stage plan" once under its name. Arrow keys move the day, Home and End to the week's ends, Page Up and Page Down a month. Read only: today's card links to Today.

### Harvest
(2026-11-04; spec `docs/superpowers/specs/2026-11-04-harvest-design.md`.) The room's **Harvest** tab (between Tasks and Simulations) and `#/harvest`, in the top bar between Calendar and Overview. Where each part lives:

| Part | Design |
|---|---|
| Run card (room tab) | **This run**: start, crops and blocks, tiles (kg, kg per block, BE, RM value, cost per kg; two a row on a phone, an odd last tile the whole row), the notes right under the tiles, the flushes table, then the harvest rows with one Edit each (Delete sits inside the Edit dialog, a quiet red button at its start). Past runs are a table, each run opening its flushes and harvests |
| Farm page | Segments 7 days, 30 days, 13 weeks, 12 months over a bar chart in `--s-harvest` (day, week or month bars); tiles; By room and By crop; Export CSV and myGAP sheet |
| myGAP sheet | `#/harvest/sheet`, a print page in light colours with no top bar: the 4-6 form's columns, the sales cells blank to write in, a "Farm:" line left blank (the app does not know the farm's name) |
| Overview card | Beside Energy: kg today, 7 days and 30 days, the 30-day value, a 48 px strip of the 30 days with no axis |

### Task grid
(2026-11-04, owner: the paper maintenance log; spec `docs/superpowers/specs/2026-11-04-task-grid-design.md`; revised 2026-11-05 after the UI/UX audit, `.impeccable/critique/2026-11-04-task-grid.md`, and the final review.) The room's Tasks tab shows the week's daily tasks as its log sheet, in the **Daily tasks** card (worker picker in its head, the day line under it, then the week's dates with ‹ This week › at the right as the Calendar's, the grid, the Undo line, the legend, and the foot: Print month · Export CSV). From 900 px the card spans the top and Upkeep and Long-term sit side by side under it. Where each part lives:

| Part | Design |
|---|---|
| Box | 40 px high on a desk (48 px turned), at least 92 px wide on a desk, a hairline `border`. **done**: a drawn tick (18 px, 2.6 px stroke in `ink`; Inter has no ✓) and the worker's initials (`fs-xs`, 600) under it; with an amount, the tick and the bare figure ("✓ 2.4") and the initials under them (turned, the figure under the tick). **missed**: an amber cross (`warning-text`, drawn as the tick: two diagonals) in a box tinted `warning-soft` with an amber border at 45 %, the grid's only amber. **skipped**: a `muted` dash, drawn as the tick. No mark is the font's glyph (the printed sheet keeps its bold ✗). **not due** and **cancelled**: no border, the ink at 9 % (about 1.35 : 1 on the card). **open** (today): a 2 px `ink-2` outline, darker on hover. **planned**: a 1 px dashed `border-strong`, not a button, and "≈" in the corner over an automatic stage change. A box being sent is dimmed to 55% and shows the progress cursor |
| Today | Desk: the row, a 2 px `accent` line above, below and at both ends. Turned: the column tinted `accent-soft` from its head (rounded top) to its last box (rounded bottom), through the task names' rows (a gradient at its seventh), not a ring broken at every name |
| Heads | The task's picture (24 px) at the top, so the pictures sit on one line, its name under it (a built-in rule's short name; an own rule's whole text, two lines at most on a desk ending "…", wrapped whole turned; only the printed sheet cuts it to 24 characters), the unit once in a `muted` line under the name ("kg", "bags removed"; the Units Rule: the boxes' figures are bare), in a quiet button (hover `band`); its tap shows the full text. The days read "Mon 2" on a desk and "M 2" turned, today's in `ink` at 600 |
| The turn | By the card's width, not the screen's: when the card is narrower than the desk grid's least width (88 px of days and 92 px a task, "Contamination" whole), the grid turns: each task's name on its own line over a row of 7 day boxes, the day heads in one row at the top, as wide as the card. So a phone, a 700 px tablet and a desk room of many tasks all get it. The same boxes, so the focus, the menu and the repaint are one code path |
| Width | The desk columns (92 to 200 px) share the card's width as the Calendar's days do, so a room of 6 tasks or more at 1440 px (and any that fills its card) ends near the card's edge with the title row, day line, week head and legend; a room of few tasks keeps a compact grid at the left (two Footbath and Floor columns are 200 px each, not 600 px bars), the head and legend still at the card's edge. Turned, the grid is as wide as the card |
| Phone head | ‹ the week's dates › on one row, 44 px steps; This week under them only while another week is on show |
| Acting | Tap an open box of today: Done (a kg or bags task opens its dialog). Long press (500 ms), right-click, Shift+F10 or the menu key: a small menu (`surface`, hairline, 40 px items; the focus ring inside the item, `band` behind; opened by a pointer the menu itself takes the focus) with Skip…, Undo and Details by the box's state. A past box's menu is Details only; today's open box's Details has Skip… and Done (primary). A mixed Done's Details lists its kg by crop under the amount. Undo shows only within a minute of the Done or Skip; the server refuses later with 409 "Too late to undo: it was done at 08:12", and after midnight with "Too late to undo: its day has ended". A box that holds a row says it has a menu (`aria-haspopup="menu"`, `aria-keyshortcuts="Shift+F10"`) |
| Undo line | After a Done or Skip from the grid that the server took (never for someone else's close after a 409): "Floor done by Sara · **Undo**" under the grid, `muted` `fs-sm`, Undo a quiet underlined button in `ink` (44 px on a phone), a polite live region; gone when the minute from the server's closed time is over, at the next tap, or on Undo (the focus back to the box) |
| Legend | Each box as it shows, 18 px, with its words: to do · done, initials · missed · skipped · not due · planned · ≈ date estimated. One list for the grid and the sheet |
| Keyboard | One Tab stop; arrow keys move, Home and End to the row's ends (with Ctrl, the grid's); the focus returns to the box after a dialog or the menu. Every box has a name for a screen reader: "Footbath, Wednesday 4 November: done by Sara at 08:12" |
| Month sheet | `#/rooms/7/tasks/sheet?month=2026-11`, a print page in light colours with no top bar: A4 portrait for 12 columns or fewer, landscape above over two pages (1st to 15th, then the rest); every row 6.6 mm to write in, so a 31-day month keeps its foot on one portrait page. A "Farm:" line left blank and "Sheet reviewed by: ____ (Management) on ____" at the foot, the month's days down ("1 Su", each Sunday ruled off) and the tasks across with the unit in brackets ("Harvest AM (kg)") and their heads sideways when narrow, an Initials column for the pen (none in a month gone by). Days gone are filled from the app: "✓ AL"; "✓ 19.59" over the initials; ✗ the heaviest mark (1.3 em, 800; amber on screen, black on paper); —; shaded not due. Days ahead are blank with the planned boxes outlined (dashed on screen, square solid cells on paper). On a phone the day column stays while the rest scrolls sideways |

## Do's and Don'ts

### Do:
- **Do** spend colour on state only: `accent` for selection, primary action and running; green in band; amber warning; red fault.
- **Do** keep temperature, humidity and CO₂ in their series hues (`--s-t`, `--s-rh`, `--s-co2`) on every trace and chart of that quantity, on both the Now and History tabs.
- **Do** keep one filled button per view or panel; show On as a tint.
- **Do** make every part that would nest either a sibling card or a hairline-separated section.
- **Do** set every number in tabular figures, with one formatter per quantity (humidity and filter pressure to one decimal) and metric units.
- **Do** add every new colour to both theme blocks under one name.
- **Do** write labels and states in plain English sentence case: name the machine, the number and the unit.

### Don't:
- **Don't** put a card inside a card.
- **Don't** colour icons, headings or target labels to decorate; the Crop tab's target icons stay `muted`.
- **Don't** use a series hue for state, a button or body text.
- **Don't** fill an On switch with solid accent beside a Send or Save.
- **Don't** add shadows to dark-theme cards or depth effects beyond the vocabulary above.
- **Don't** add gradients, shadows or hatching to the room drawing, or change what it represents.
- **Don't** colour a picture by state, or let a picture say something its words do not.
- **Don't** show a quantity in two formats on two tabs, or any US unit.

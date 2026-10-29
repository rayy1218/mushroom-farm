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
**The State-Only Colour Rule.** Everywhere outside the measured series, colour means state: blue is selection, primary action and running; green is in band; amber is warning; red is fault. Icons, headings, links in prose and target labels stay neutral (the Crop tab's target icons are `muted`).

**The Series Identity Rule.** (2026-10-28: energy and water have their own hues too.) Temperature, humidity and CO₂ keep their own hues (`--s-t`, `--s-rh`, `--s-co2`) on the reading-card traces and the History charts. This deliberately adapts the category standard's "nothing else coloured": the hue carries a metric's identity from the Now tab to the History tab, which is a data job, not decoration. A series hue never marks state, never fills a button and never colours text other than a chart's own legend.

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

**The Near-Edge Rule.** (2026-10-28, owner: amber on a reading the machines were holding taught people to ignore amber.) A temperature or humidity in band but within 15 % of the band's width of an edge is amber only when the machine that should act is not acting, or when the reading has stayed near that edge for 15 min (its trace tells); otherwise it shows the calm "In band". The machine that should act: humidity low, the humidifier; humidity high, a fitted dehumidifier; temperature high, the aircon cooling; temperature low, the aircon not cooling. A machine the room does not have (or not known) never counts as not acting, so such a reading turns amber only after 15 min there. The words fit one line: "Near low", "Near high", with "· falling" or "· rising" when the trend runs toward that edge (web/band-math.js `nearChip`, the same on the Overview and the room page). Out of band is amber, a fault red. (2026-10-29, owner: "OK" beside an amber "Near high" read as a contradiction.) On the Overview a room with no alarm, nothing out of band and in Auto but with an amber near-edge reading takes an amber "Watch" pill, not "OK", and sorts after Manual and before OK; it does not count as needing attention, and the status line names it ("3 rooms OK · Room 1 humidity near high") or counts several ("2 rooms to watch") (web/overview-math.js `nearEdges`).

**The Exchange Words Rule.** CO₂ has no band to stay in: its two numbers are where the air exchange starts and stops, so its status says what the exchange is doing (web/band-math.js `co2Status`, the same on the Overview, the reading card and the drawing). Below the stop point and "Exchange off" are green; "Exchange running" is neutral (`ink-2`), never amber; "Over the start point" with the exchange not running is amber; within 15 % of the gap from the start point to the safety level "Near the safety level" is amber; at the safety level red. On the Overview "Exchange off" carries its start point ("Exchange off · starts at 1,400 ppm"): a high reading with the exchange off is then not read as a contradiction.

**The Units Rule.** Every number on screen carries its unit, the controller's reasons included ("CO₂ 744 ppm between 700 and 800 ppm"), and the reasons compare in words, never in maths signs ("RH 87.9 %, at or under its on-point 88 %", "CO₂ 1,450 ppm, at or over 1,400 ppm"); thousands are grouped (1,000 ppm); a range of dates takes an en dash. An aircon is entered and shown in kW; its BTU/h class (the size shops sell) is a picker and a note in brackets, never the input's unit.

**The By-Hand Rule.** A value a person set that differs from the program (a band changed on Setup) is shown in the accent text colour with the program's own value under it ("stage: 900 ppm") and a way back ("Back to stage values"): a choice, not a warning. Both places say it: the Setup inputs and the Crop tab's current stage (web/crop-math.js `byHandValues`, `stageBody`); while they agree nothing shows.

**The Navigation Rule.** The top bar holds the farm's name, Live, the theme, Overview and Settings, and a red alarm button only while there are alarms. The Overview holds every room (the Rooms list is folded into it) and Add room; a room is reached from its card or the room switch on its page.

**The One Format Rule.** A quantity has one formatter and every tab uses it: humidity and filter pressure to one decimal (91.2 % RH, 40.2 Pa), metric units with a space before them, ranges with an en dash (19–21 °C). If two tabs could disagree about a number, they share the formatter.

## Layout

One sticky top bar (56 px, 61 px on a phone with its 44 px buttons: brand, Live, theme, Settings; `--topbar-h`, which the sticky heads under it and a dialog's top follow) over a single column at most 1400 px wide, padded 24 × 28 px from 900 px up and 14 px below. The room page opens with a head (back link, room name, size line, room switcher at the right) and underline tabs; a phone scrolls the tab row sideways with a fade at the edge that has more.

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

### Segmented control
Auto | Manual and the History range choice: a `band` track with a hairline, unselected options `muted` text on nothing, the selected option on `surface` with `ink` text and the selected-segment shadow. A line under it says in plain words what the choice means.

### Navigation
- **Top bar:** sticky, translucent `surface` with blur and a hairline bottom; brand mark and name at the left, Live (green dot when live), the theme button (a sun or moon SVG showing the theme it switches to) and Settings at the right. On a phone the subtitle and the Settings word hide.
- **Underline tabs:** 500 weight, `muted`; hover and current turn `ink`; current carries a 2 px `accent` underline on the row's hairline. A tab with a live problem shows a 7 px amber or red dot.
- **Setup links:** round outlined chips; on a phone they stick under the top bar while Setup scrolls.

### Machines list
The machines in the order the air meets them, numbered, one row each: name (500), a `muted` sub-line saying what it does and why ("Adds moisture · On at 88 % RH, off at 92 % RH" for a band of 87–93 % RH: the humidifier switches inside the band, web/band-math.js `humidifierPoints`), and a state pill or, in Manual, the On/Off switch. A machine not doing what it was told turns its row text `critical-text` and keeps its fault pill beside the switch.

### Room drawing (mimic)
The room's picture keeps its representation: the air path, the condenser outside, the machines in air order and the shelves of blocks, drawn as flat shapes with one colour per thing (no gradients, shadows or hatching). Its palette is neutral slate (`--m-*` tokens in `mimic.css`, set per theme on the host) with blue (`--m-run`) for running fans and "On" labels; the drawing's own representational colours (cool and warm air, mist, light, the blocks) stay as they are. It sits in a card with 10 px clipped corners and no frame of its own, except in the light theme, where a 1 px `border-strong` line inside its edge keeps the pale sky from melting into the white card; on a narrow host the smallest labels hide because the page says them elsewhere.

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
- **Don't** show a quantity in two formats on two tabs, or any US unit.

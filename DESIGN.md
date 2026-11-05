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
  on-critical: "#ffffff"
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
  series-harvest: "#b8844e"
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
  series-harvest-light: "#a87a4c"
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
  figure:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    fontFeature: "\"tnum\", \"cv11\", \"ss01\""
  name:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.45
  card-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.45
  field-label:
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
  small: "6px"
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
    textColor: "{colors.on-critical}"
    rounded: "{rounded.control}"
  button-compact:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.control}"
    padding: "4px 12px"
    height: "32px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.small}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
    height: "28px"
  button-quiet-hover:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink}"
  switch-off:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "4px 12px"
    height: "36px"
    width: "64px"
  switch-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
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
  chip-level-warning:
    backgroundColor: "transparent"
    textColor: "{colors.warning-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-level-serious:
    backgroundColor: "transparent"
    textColor: "{colors.critical-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-level-critical:
    backgroundColor: "{colors.critical}"
    textColor: "{colors.on-critical}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-level-acknowledged:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  count:
    backgroundColor: "{colors.border-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 4px"
    height: "18px"
  count-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.page}"
  tab:
    textColor: "{colors.muted}"
    padding: "10px 12px"
  tab-active:
    textColor: "{colors.ink}"
  link-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
    width: "480px"
  dialog-wide:
    width: "560px"
  menu:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "4px"
    width: "168px"
  menu-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    height: "40px"
  menu-item-hover:
    backgroundColor: "{colors.band}"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
    padding: "4px 8px"
  table-head:
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    padding: "6px 8px"
  table-cell:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "6px 8px"
  tile:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    padding: "2px 0 2px 14px"
  checkbox:
    size: "18px"
  checkbox-phone:
    size: "20px"
  empty-state:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.card}"
    padding: "20px"
  banner-error:
    backgroundColor: "{colors.critical-bg}"
    textColor: "{colors.critical-text}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
---

# Design System: Mushroom farm

## Overview

**Creative North Star: "The Control Room, Played Straight"**

The farm app is a climate-controller dashboard in the category standard: a neutral dark ground, one blue accent, status colour that means something, and numbers set like instruments. It sits beside Grafana, Home Assistant, Vercel/Linear and Ubiquiti UniFi, the four products the owner named as the craft bar, and it aims at their finish rather than at a look of its own. A room's state has to be legible in one glance, at a desk or on a phone at the room door, so decoration never stands in for state.

Density is moderate and calm: cards on a quiet page, hairlines rather than boxes, a tight type scale with tabular figures, plain English and metric units in every line. Colour is spent on state and, by a deliberate exception, on the identity of the three measured quantities. Dark is the default (the owner's choice); a light theme mirrors it token for token.

Scope: every page uses these tokens. The room page (`#/rooms/:id` and its tabs) was rebuilt in this world on 2026-10-28 and every page since (Today, Calendar, Harvest, the task grid) was built in it; the Rooms list is folded into the Overview. (2026-11-05, design-system audit) Some parts built before the components below were written down still differ from them in small ways: a few type sizes and corners off the scale, three chip styles where one is meant, section card titles a step large on some pages. They are listed in `docs/superpowers/plans/2026-11-05-design-system-css-pass.md`; until that pass, the words here are the target, not the stray CSS. A new page uses the components here as they are, before inventing one.

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
- **Harvest Ochre** (`series-harvest`, `--s-harvest`): the kg picked, on the Harvest page's bars and the Overview's 30-day strip.

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
- **Title** (600, 20 px): a Setup part's title, a large status value on equipment cards, the crop name on the Crop tab, a print sheet's title.
- **Figure** (700, 20 px, 1.25, tabular): a tile's number (kWh, kg, RM, BE); a page's one main figure may take Display instead (the Harvest page's kg).
- **Name** (600, 16 px): the name of a thing whose card it is (a room on the Overview and Today, a stage on the Crop tab, the picked day on the Calendar, the crop on the Now tab's Crop card), a section heading on the page over a row of cards ("Rooms"), the Overview's status line and a simulation's verdict.
- **Card title** (600, 14 px): what a card holds ("Control", "Machines", "Upkeep", "This run", "Energy and water", "Phone alarms"), a chart's title, a group's title inside a card. A card names its contents at this size on every page; the Name step is for a thing, not a section.
- **Field label** (600, 14 px): a field's label above its box, a fieldset's legend, a checkbox's words when they are the field's name.
- **Body** (400, 14 px, 1.45): rows, descriptions, form text; hints capped near 60 ch.
- **Small** (400 or 500, 13 px): bands, sub-lines, notes, the tab row on a phone.
- **Label** (600, 12 px): pills, status chips, legends, step numbers. Sentence case, no tracking.

On screens up to 600 px the three smallest steps grow by 1 px (13, 14, 15) for reading at the room door, and a field's text is 16 px so a phone does not zoom into it. The steps are the `--fs-*` tokens (`xs` 12, `sm` 13, `md` 14, `lg` 16, `xl` 20, `2xl` 24, `3xl` 32); a size is always one of them, never a `rem` or a fixed pixel size, so it follows the phone step (Display's 28 px on a phone and a print sheet's `pt` sizes are the only others). Weights are 400, 500, 600 and 700; 800 only for the printed sheet's ✗. Nothing is set under 12 px.

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

Every page opens with the same head: an optional back link ("← Overview", 13 px `ink-2`, the arrow drawn by the link itself), the page title in Headline, a sub-line in `ink-2` (13 px, 14 px from 900 px, at most 70 ch), and the page's actions at the right from 900 px (full width under the title on a phone, one button each, Overview's beside the title). A page's own pickers (the worker on Today, the range on Harvest) sit in this head, not in a card. Each page's grid:

| Page | Grid |
|---|---|
| Overview | The status card across the page; Alarms under it while there are any; the room cards auto-fit at 320 px or more, by name; then Outdoor, Energy and water, and Harvest auto-fit at 300 px |
| Today | The rooms as cards, two a row from 1100 px; Long-term under them |
| Calendar | The month card and the picked day's card, 1.5 : 1 from 1100 px (the day at least 320 px), stacked below |
| Harvest | The totals card (tiles and the chart) across the page; By room and By crop under it at 3 : 2 from 1100 px |
| Settings | Cards two a row from 1100 px: the farm's settings (Readings, Outdoor sensor and Prices as hairline-ruled parts of one card) beside Phone alarms, then Workers beside Task rules; Yield across both columns |
| Room tabs | Now: as above. History: a sticky head (range and part links) over one column of chart cards. Tasks: Daily tasks across the top, Upkeep and Long-term side by side from 900 px. Harvest: This run and Past runs at the left, Harvests at the right, 3 : 2 from 1100 px. Crop: stages, the Stages list sticky at the right (220 to 270 px), the program row under. Setup: parts down the page under sticky link chips |
| Simulations, a run | The list card; a run is its verdict card, what it was given (folded), then its result cards in one column |
| Suggest machines | The form (at most 760 px) with "how the search works" sticky beside it from 1200 px; then the suggestions as rows of five columns |
| Print sheets | No top bar, light colours whatever the theme, A4; on screen a phone scrolls the sheet sideways, its first column sticky |

Rhythm runs on 4 px: 4, 8, 12, 16, 20, 24, 32. Cards gap 16 px (12 px on a phone); rows inside a card pad 8 to 10 px; Setup parts are 32 px apart with a 24 px top rule. Breakpoints: 600, 760, 900 and 1100 px (480 and 1200 px for one part each: the room drawing's fold and Suggest's aside); a part that sits in cards of many widths turns by its card's width (a container query or a measured width, as the Crop tab and the task grid), not the screen's.

**The 44 px Rule.** On a phone every control is at least 44 px tall (and an icon button 44 px wide, 40 px under 400 px): buttons, fields, selects, link chips, tabs, a fold's summary, a link that is a row's only way in, a checkbox's words. A desk keeps the compact heights (36 px buttons, 40 px fields, 32 px compact buttons). Where a target cannot grow without moving the layout, its padding grows and a negative margin of the same size keeps the spacing.

**The Readings First Rule.** On a phone the order is readings, alarms, control, machines, the drawing, then the crop: the question "is the room OK" is answered before any scroll.

## Elevation & Depth

Flat by default. Depth comes from tone (`surface` cards on the darker `page`) and a hairline edge, not shadows. The dark theme uses no card shadows at all; the light theme gives cards a single 1 px soft shadow so white cards separate from the pale page.

### Shadow Vocabulary
- **Card lift, light only** (`box-shadow: 0 1px 2px var(--shadow)`): every `.card` in the light theme.
- **Selected segment** (`box-shadow: 0 1px 2px var(--shadow), 0 0 0 1px var(--border)`): the chosen option in a segmented control.
- **Dialog** (`box-shadow: 0 12px 40px var(--shadow)`): modal dialogs over the `backdrop` (60 % black in dark, 40 % ink in light).
- **Menu** (`box-shadow: 0 8px 24px var(--shadow)`): a menu over the page (the task grid's long press menu).
- **Current-stage ring** (`box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)`): the current stage card on the Crop tab, with its border at 60 % accent.

### Named Rules
**The One Card Level Rule.** There is never a card inside a card. Parts that would nest become cards themselves (each Crop stage, the Stages list and the program row are sibling cards) or hairline-separated sections inside one card (the Control groups, the Machines rows, the Setup status footer as a 1 px top rule, not a box).

## Shapes

Soft, consistent corners, six steps and no others:

| Step | Radius | Where |
|---|---|---|
| Card | 12 px (`--radius-card`) | cards, dialogs, empty states, the toast |
| Track | 10 px | a segmented control's track; the room drawing's clipped corners; a picture's empty tile |
| Control | 8 px (`--radius`) | buttons, inputs, selects, a menu, a calendar day, a banner |
| Segment | 7 px | a segment inside its track |
| Small | 6 px | a box inside a card (a task grid box, a Stages list entry, a list row's hover), a tooltip, a focus ring drawn inside a tab or a scroller |
| Pill | 999 px | pills, chips, counts, link chips, status dots, and the ends of every bar (a stage's day bar, the filter bar) |

A legend's key box is its box drawn smaller and keeps its corner in proportion (4 px at 18 px); the brand mark is a drawing, not a shape on this scale. Borders are 1 px hairlines; dashed hairlines mark empty states, planned boxes and machines not fitted. Status is drawn as 6 to 10 px dots, never as glyphs or emoji.

## Components

### Buttons
Quiet and solid: most buttons are neutral, so the one blue button is the obvious next step.
- **Shape:** gently rounded (8 px), 36 px tall, 500 weight.
- **Primary:** `accent` fill, white text. One per view or panel: Send, Save, Add.
- **Default:** `raised` fill, `border-strong` edge, `ink` text; hover mixes 7 % ink into the fill.
- **Danger:** `critical` fill with white text for Delete; `critical-text` on a neutral button for quieter destructive links.
- **Focus:** 2 px `accent` outline, 2 px offset, on every control.
- **Disabled:** 55 % opacity; Save and Reset only look disabled while saving, so focus is never lost.
- **Compact:** a default button 32 px tall, 4 × 12 px, 13 px text, for an action inside a row or a card's foot that is not the card's main one (Acknowledge on an alarm row, Back to stage values, Show all stages). 44 px on a phone.
- **Quiet:** no fill and no edge, `muted` 13 px text, 28 px tall, 4 × 8 px; hover fills `band` and turns `ink`. For the row actions that should not compete with the row's words (Skip on a task, Edit on a harvest), and a dialog's quiet Delete at the footer's start (in `critical-text`, away from Save).
- **Text link button:** a button that reads as a link (the Undo line's Undo, the stepper's done steps): no fill, no edge, underlined 3 px under, `ink` or `accent-text`.
- **A link as a button** (Export CSV, Suggest machines, Print month): the default button's look exactly, `raised` fill and 36 px, so a reader cannot tell a link from a button by its shape.
- **Icon button:** 36 × 36 px (44 on a phone), no fill until hover (`band`), `ink-2` icon: the theme button, the stage editor's pencil, the ‹ › steps of the Calendar and the task grid.
- **Groups:** a dialog's or a form's buttons sit at the right end in reading order (Cancel, then the primary); on a phone they wrap with the primary on top.

### On/Off switches
- **Off:** a default button reading "Off", 64 px wide at least, 36 px tall, 600 weight.
- **On:** tinted, not filled: `accent-soft` fill, its edge `accent` at 55 %, `accent-text` words; hover deepens the fill to `accent` at 24 %. Tinting keeps the page's primary action (Send, Save) the one filled button.
- **Placement:** in Manual each machine's switch sits on its own Machines row; in Auto the row shows its pill instead. The same switch turns a task rule on or off in Settings and a machine's Power in the aircon panel; it is a button with `aria-pressed`, never a sliding toggle.

### Status pills
- **Style:** full-round, 12 px 600, 2 × 9 px padding, tinted background with its own text colour.
- **Tones:** running (`accent-soft` / `accent-text`, with a 6 px dot), good (green), warning (amber), fault (`critical-bg` / `critical-text`), off (`band` / `ink-2`), no data (`muted`). An acknowledged alarm that is still active is not faded: its chip turns a neutral outline (`border-strong` / `ink-2`), its text `ink-2`, and its times line says "Acknowledged". An active alarm about a reading puts the value now beside the value that raised it ("· now 84.0 % RH").
- **Status word:** where a whole pill would be too loud beside a big number (a reading card's "In band", the Overview's band line), the pill's words alone in its text colour, 12 px 600.

### Chips and counts
A pill says a state; a chip says a level or a mark; a count says how many. One shape for all three: full-round, 12 px 600.

| Kind | Look | Where |
|---|---|---|
| Level chip | Outlined in its colour, no fill, 2 × 8 px: warning `warning-text`, serious `critical-text`; critical a solid `critical` fill with white words; acknowledged a `border-strong` outline in `ink-2` | An alarm's level on the Alarms card and the Overview |
| Mark chip | Outlined `border-strong`, `ink-2` words, 2 × 10 px; the current one `accent-soft` with `accent-text` and its edge at 50 % accent | A stage card's place in the plan on the Crop tab ("Current · day 2 of 7 · flush 1 of 4", "Next · about 9 Nov 08:00") |
| Count | 18 px tall, at least 18 px wide, 0 × 4 px, 700, `border-strong` fill with `ink` words; amber (`warning` fill, `page` words in dark, `ink` in light) when something in it is overdue | The Tasks tab's count, the top bar's Today count |
| Dot | 6 to 10 px, full-round, no words of its own: the words beside it say the state | Live, a tab with a live problem (7 px), the Overview's status line, a sensor's state, a calendar day on a phone |

### Link chips
Round outlined chips, 13 px 500 in `ink-2` on a `border-strong` edge, 6 × 12 px; hover turns the words `ink` and the edge `ink-2`. They jump to a part of a long tab (Setup's and History's parts) and never act; a strip of them that does not fit scrolls sideways with a fade at the edge that has more (`data-more`), as the tab row does.

### Cards / Containers
- **Corner Style:** 12 px.
- **Background:** `surface`.
- **Shadow Strategy:** none in dark; 1 px lift in light (see Elevation).
- **Border:** 1 px `border`; an alarm card takes its worst active alarm's colour (`warning-text` for warnings, `critical-text` from serious up); a reading out of band uses `critical` with an inset 1 px ring, a warning reading amber at 55 %.
- **Internal Padding:** 20 px (16 px on a phone). A card head puts its Card title (14 px 600) at the left and a quiet `muted` note or a control at the right, 14 px over the card's body; a card that is a thing (a room, a stage, a day) carries its Name (16 px 600) there instead, with its picture before it.
- **Sections inside a card:** a 1 px `border` rule and 16 px above each, its title in Card title; rows inside a section are ruled by `border` too, the first row with no rule.
- **A card that opens a page** (a room card, the Now tab's Crop card): its title is a plain `ink` link stretched over the whole card; any other link or button in it sits above that link; hover deepens the edge to `border-strong`.
- **Toned edge:** a card whose subject has a state takes it on its edge only, never its fill: amber at 55 % (`warning`), red `critical-text` or `critical` (an out-of-band reading adds a 1 px inset ring); a simulation's verdict green, amber or red at 50 to 55 %; Control in Manual amber at 55 %.

### Reading card (signature)
The Now tab's three cards: the quantity name (13 px `ink-2`) with its status word at the right (green, amber or red), the value in Display type with a `muted` unit, the band in Small type, then a 36 px trace of the last hour in the quantity's series hue with its band shaded behind it. On a phone the value and trace sit side by side.

### Inputs / Fields
- **Style:** 40 px tall, 8 × 10 px padding, `surface` fill, `border-strong` edge, 8 px radius; its label in Field label (14 px 600) 4 px above it, and its hint (13 px `muted`, at most 60 ch) and error line under it. Every text box, number box, select and text area looks the same, wherever it sits (a dialog, a table's cell, a row of Setup bands); a number box is as wide as its numbers (12 ch, 14 ch with a unit inside it), not the column's width.
- **Unit inside the box:** a quantity's unit sits inside the box at its right end in `muted` ("kg"), so the box keeps its width and the label stays a word.
- **Side by side:** fields in a row share one grid (subgrid) for their label, box and error rows, so a label on two lines or an error under one box never moves its neighbour's box. Two a row in a dialog, one a row on a phone except short pairs (a date and its time).
- **Select in a line** (the room switch, the worker picker, the Calendar's room): the field's box at 36 px with its label beside it in 13 px `ink-2` rather than above; the room switch alone takes the `raised` fill, being navigation.
- **Focus:** 2 px `accent` outline.
- **Error:** border and message in `critical-text`; the field stays in place (sibling fields share label, input and error rows).
- **Check:** a value that is allowed but unlikely (a harvest pick over 0.3 kg a block): border and message in `warning-text`, not `aria-invalid` (a question, not a fault), the message still announced (the box's description, `aria-live`); the primary button reads "… anyway" ("Record anyway") and the same value sent again is kept, a changed one checked again.

### Checkboxes and radios
The browser's own, in `accent-color`, 18 px on a desk and 20 px on a phone, the box before its words with a 8 to 10 px gap; the words are the label (a tap on them toggles it) and the whole line is 36 px tall on a desk, 44 px on a phone. A checkbox that is a field's whole answer (Lights fitted, Automatic change) takes the Field label's 600 words; one of a list (the alarm levels to send) takes body words. A choice of one from a few (the simulation's days, its bands) is radios with any detail indented under its words.

### Segmented control
Auto | Manual, the History, Exchange and Harvest range choices: one component. A `band` track with a hairline, 3 px inside, 10 px corners; options 30 px tall (44 px on a phone), 4 × 14 px, unselected `muted` 500 text on nothing (hover `ink`), the selected option on `surface` with `ink` text, 7 px corners and the selected-segment shadow. A line under it says in plain words what the choice means. On a phone a range choice may take the row's width, its options sharing it.

### Navigation
- **Top bar:** sticky, translucent `surface` with blur and a hairline bottom; brand mark and name at the left, Live (green dot when live), the theme button (a sun or moon SVG showing the theme it switches to) and Settings at the right. On a phone the subtitle and the Settings word hide.
- **Underline tabs:** 500 weight, `muted`; hover and current turn `ink`; current carries a 2 px `accent` underline on the row's hairline. A tab with a live problem shows a 7 px amber or red dot.
- **Setup links:** round outlined chips; on a phone they stick under the top bar while Setup scrolls. On a phone Setup's and History's links say short words (Bands, Equipment, Filter, Room; Climate, Energy, Exchange, Machines) so all four fit at 360 px, and a strip fades only at an edge that still hides a link.
- **Sticky heads:** a long tab's own head (History's range and links, Setup's links on a phone) sticks under the top bar on `page` with a hairline under it, as short as it can be (one line of each on a phone); a part it jumps to stops clear of it (`scroll-margin-top`).
- **Back link:** "← Overview" and the like, 13 px, `ink-2` (`muted` on the room page), underlined on hover; the arrow comes from the link's style, not its words.

### Dialogs
- **Shape:** `surface`, 12 px corners, a hairline edge, the dialog shadow, 24 px inside; 480 px wide (560 px for the Simulate stepper), 16 px from the screen's edges on a phone. It opens anchored under the top bar, not centred, so a step that changes its height does not move it, and scrolls inside when it is taller than the screen.
- **Inside:** the title in Name type (16 px 600), a lead line in `ink-2` saying what it acts on (the task's name and what to do), the fields, a `form-error` box over the buttons when the server refuses, then the buttons at the right: Cancel, then the one primary. A destructive confirm has a red Danger button as its primary and says what goes and whether it comes back ("Delete this simulation? This can't be undone."); a delete inside an Edit dialog is the quiet red button at the footer's start ("Delete this harvest").
- **Focus:** the first field, or the title when there is no field (a confirm); back to the control that opened it on close; Escape closes it.
- **Steps:** the Simulate stepper numbers its steps across the top (the current one `ink` 700 with a 2 px accent underline; done steps are links back to them), scrolls each step inside one height on a desk, and keeps Cancel, Back and Next in a sticky footer with a hairline over it.

### Menus and tooltips
- **Menu:** `surface`, `border-strong` edge, 8 px corners, the menu shadow, 4 px inside, at least 168 px wide, items 40 px (44 px on a phone) in body type with no fill until hover or focus (`band`, the focus ring inside the item). It opens at the thing it acts on, arrow keys move, Escape closes and the focus goes back. Used for a box's actions in the task grid; a page never hides its main actions in one.
- **Tooltip** (a chart's hover read-out): `ink` fill with `surface` words, 12 px tabular, 4 × 8 px, small corners, no arrow, following the pointer along the chart. Nothing else has a tooltip: a word that needs explaining gets a hint line.

### Tables
One data table, used by the Energy and water figures, a simulation's results, the Harvest flushes and runs, By room and By crop, and Settings › Yield:
- **Head:** 13 px 600 `ink-2`, sentence case, no rule above it; numeric heads right-aligned over their figures.
- **Rows:** 6 × 8 px cells, a `border` rule above each, body type; the first column the row's name (600 when it is a name, a link when it opens one); figures right-aligned, tabular, never wrapping inside a figure; a total row 700 with a `border-strong` rule above.
- **No zebra stripes, no boxed cells.** A row that differs (a simulation compared with the others) is tinted `accent` at 10 % and says "differs" beside its name; a row that opens to more is a button with a turning chevron, its detail indented under it with a 2 px `border` rule at its left.
- **Phone:** a table whose columns do not fit becomes a stack of rows, each a block of labelled figures (the label in 12 px `muted` above its figure, three a row), or its long column names give way to short ones (`sim-short`); a sheet that must keep its columns scrolls sideways inside its own box with a fade at the edge that has more, its first column sticky.
- **Print sheets** (myGAP, the month of daily tasks) are the exception: ruled boxes on every cell, to be written in by hand.

### Tiles
A card's handful of headline figures (Energy and water, a simulation's results, This run, the Harvest totals, the Overview's Harvest): side by side, each a 1 px `border-strong` rule at its left and 14 px in, its label (13 px `ink-2`) over its figure (Figure type: 20 px 700, tabular, its unit in the same line) and an optional basis line (12 px `muted`: "estimated", "metered"). Tiles wrap rather than shrink a figure: each at least as wide as its figure, two a row on a phone with an odd last tile taking the row. A tile's figure may take a state colour only when the number itself is the state (a simulation's time in band); a page's main figure may take Display.

### Rows
Most cards are lists of rows, and every list is built the same way: rows ruled by a `border` hairline above each (none above the first), 8 to 10 px tall padding, the thing's picture or number at the left, its name (500) over a sub-line (13 px `ink-2` or `muted`: what it does, when, who), and its state or actions at the right (a pill, a switch, quiet buttons). A closed or done row drops to `ink-2` 400 and fades its picture to 60 %; it is never struck through. Machines, alarms, tasks, harvests, calendar items, workers, task rules and the Overview's room and energy lines are all this row.

### Folds
A part that can be put away (a Setup part on a phone, what a run was given, the room drawing on a small phone, a run's flushes, "+ 4 daily tasks") folds under its own title: the title is the summary, 44 px tall on a phone, a drawn chevron at its right end (8 px, 2 px `muted` lines) pointing down when closed and up when open; a fold inside a row (a past run) puts a 6 px chevron before its words and turns it. The browser's own disclosure triangle is not used. A fold says what it holds in its title ("What this run was given", "Show the room drawing", "+ 4 daily tasks"); never "More".

### Messages
| Kind | Look | Where |
|---|---|---|
| Page error | A banner over the page's content: `critical-bg` with `critical-text` words, 8 px corners, 12 × 16 px, `role="alert"`, a Retry at its right when one helps | The server could not be reached or refused a page's data |
| Form error | The same tint in a box over a dialog's or form's buttons, 8 × 12 px | The server refused a save (409, 400); the words are the server's |
| Field error | 13 px `critical-text` under its box, the box's edge `critical-text`; a check (a value allowed but unlikely) is the same in `warning-text` | One field's value |
| Inline error | 13 px `critical-text` on the row it is about | A switch the controller refused, a stage that would not start |
| Saved | "Saved" in 600 `good-text` under the form, a polite live region, gone at the next edit | Settings, Setup, Task rules |
| Unsent | "Unsent changes" in 13 px 600 `warning-text` beside Send | Control and Machines edits not yet sent |
| Stale | 13 px 600 `warning-text` over the readings ("These are the readings from 08:12; the farm server can't be reached."); the readings stay, greyed, their pills and dots in grey | The server's stream dropped |
| Load fail | A card at the screen's foot, `critical` edge, its words and a primary Reload | The app did not start in 8 s |

Messages say what happened and what to do in plain words, with the number and unit when there is one; never "Error" or "Something went wrong" alone.

### Empty states
A part with nothing in it yet keeps its place and says so: a card with a 1 px dashed `border-strong` edge and no fill (no light-theme shadow), its words in `ink-2` (what is missing and why), its picture faded to 40 % when it has one, and the one way forward as a button or link ("No crops in this room yet." with "Give it crops on the Crop tab"). A list with nothing in it now is one `muted` line in its card ("Nothing due today.", "All done for today."), not a dashed card. A page whose subject is gone ("That room no longer exists") is the same dashed card with the way back.

### Progress
A simulation's run: the browser's progress bar, 14 px, full width, in `series-humidity`'s blue, with its line in 600 tabular over it ("Waiting for its turn…", "Running… 21 %", "Done", or "Failed:" and why). A stage's day bar and the intake filter's bar are drawn: a 6 px or 10 px `band` track with full-round ends and its fill (accent for a stage's days; green, amber or red for the filter by its pressure, with a tick at the change point).

### Machines list
The machines in the order the air meets them, numbered, one row each: name (500), a `muted` sub-line saying what it does and why ("Adds moisture · On at 88 % RH, off at 92 % RH" for a band of 87–93 % RH: the humidifier switches inside the band, web/band-math.js `humidifierPoints`), and a state pill or, in Manual, the On/Off switch. A machine not doing what it was told turns its row text `critical-text` and keeps its fault pill beside the switch.

### Line charts
History's and a simulation's charts are one component (web/chart.js), drawn at the card's own pixel width. The y axis is numbered at 3 to 6 round values (1, 2, 2.5 or 5 times a power of ten, one every 28 px or more of plot) with a grid line at each, thousands grouped ("1,000"); the bar charts (Usage, Exchange, Harvest) run their axis to the first multiple of the same steps at or over the peak (25.3 gives 0, 10, 20, 30; 290 gives 300), and counts keep whole steps. The band is a shaded zone with dashed limits; its two numbers sit at the left end inside the plot, the top one over its line and the bottom one under it (turned to the other side rather than leave the plot), on a backing of the card's colour, and an axis number on the same row is left out (`bandLabels`). A band that moved is numbered by its values at the left end too. The outdoor line is dotted in the chart's hue at 55 %, under the band's shading and the room's line, on its own scale numbered alone at the right edge (not on a phone, where its legend gives its latest value).

### Room drawing (mimic)
The room's picture keeps its representation: the air path, the condenser outside, the machines in air order and the shelves of blocks, drawn as flat shapes with one colour per thing (no gradients, shadows or hatching). Its palette is neutral slate (`--m-*` tokens in `mimic.css`, set per theme on the host) with blue (`--m-run`) for running fans and "On" labels; the drawing's own representational colours (cool and warm air, mist, light, the blocks) stay as they are. It sits in a card with 10 px clipped corners and no frame of its own, except in the light theme, where a 1 px `border-strong` line inside its edge keeps the pale sky from melting into the white card; on a phone the whole drawing fits the card's width (2026-10-29: at its own size it was mostly sky until swiped), and under 640 px of picture its labels hide because the Machines list and the readings say them in words. Its words are sized in the drawing's own units (13 px, the big readings 18 px 700, in `mimic.css`) and scale with it, so they sit outside the type steps. Under 480 px of screen (2026-10-29c) it folds, closed, under "Show the room drawing": that small, it says nothing the Machines list does not; wider screens show it with no fold.

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
- **Do** build a new page from the parts above (card, card head, rows, tiles, the data table, the segmented control, chips, folds, messages, empty states) before writing a new one; a module's CSS uses the tokens and these parts' classes and adds only what is its own.
- **Do** set every size from the `--fs-*` steps and every corner from the six radius steps; every control 44 px on a phone.

### Don't:
- **Don't** put a card inside a card.
- **Don't** colour icons, headings or target labels to decorate; the Crop tab's target icons stay `muted`.
- **Don't** use a series hue for state, a button or body text.
- **Don't** fill an On switch with solid accent beside a Send or Save.
- **Don't** add shadows to dark-theme cards or depth effects beyond the vocabulary above.
- **Don't** add gradients, shadows or hatching to the room drawing, or change what it represents.
- **Don't** colour a picture by state, or let a picture say something its words do not.
- **Don't** show a quantity in two formats on two tabs, or any US unit.
- **Don't** make a second version of a part that exists (another chip, another segmented control, another table style, another chevron); change the one part, for every page.
- **Don't** set a size in `rem`, under 12 px, or a weight other than 400, 500, 600 and 700.
- **Don't** title a section card at the Name size; Name is for a thing's own card.

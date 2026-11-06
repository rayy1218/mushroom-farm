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

**The Navigation Rule.** The top bar holds the farm's name, Live, the theme, Today (with its count), Calendar, Harvest, Business, Overview and Settings, and a red alarm button only while there are alarms; on a phone the links are their icons and, with too little room for it (about 400 px wide since Calendar, 2026-11-03), the farm's name shows as its mark alone. (2026-11-04, Harvest: under 400 px the top links and the theme button are 40 px wide and 44 px tall, so six icons fit at 360 px with the mark; under 380 px, while the alarm button shows, the farm's mark is hidden, as there is no room for it.) (2026-11-05, the task grid audit: from 601 to 899 px the five worded links left the mark 22 px under "Live" and the page scrolling sideways at 700 px, so up to 899 px the links are their icons, 44 px wide, the Today count kept, as on a phone; from 900 px they carry their words. With the alarm button showing, 900 to about 1000 px keeps the 28 px mark without the farm's name.) (2026-11-05, Business: a seventh icon. Up to 1099 px the links are their icons and from 1100 px they carry their words, as six worded links, the alarm button, Live and the theme take 868 px (at 900 px they ran the bar 8 px past its edge). Up to 600 px the Live mark is its dot alone, green when live, whether or not the alarm button shows (its words for a screen reader and in its title), and while the alarm button shows it stands in for the Overview link, as both open the Overview; under 430 px the top links and the theme button are 38 px wide and 44 px tall, so the seven icons fit at 360 px with the mark, and two-figure alarm and Today counts fit from 360 to 430 px; the mark shows whole or not at all.) The Overview holds every room (the Rooms list is folded into it) and Add room; a room is reached from its card or the room switch on its page.

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
Auto | Manual, the History, Exchange and Harvest range choices: one component. A `band` track with a hairline, 3 px inside, 10 px corners; options 30 px tall (44 px on a phone), 4 × 14 px, unselected `ink-2` 500 text on nothing (hover `ink`), the selected option on `surface` with `ink` text, 7 px corners and the selected-segment shadow. A line under it says in plain words what the choice means. On a phone a range choice may take the row's width, its options sharing it. (2026-11-05, the joint Business audit: `muted` on the track over the light page was 4.2 : 1, so the range control's unselected segments (`.range-bar`: History, Harvest, Sales, the 4-5 sheet, Batches' Past) are `ink-2`, 7.5 : 1; the selected one stays told by its `surface` and shadow.)

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
| Run card (room tab) | **This run**: start, crops and blocks, tiles (kg, kg per block, BE, Expected value, energy per kg; two a row on a phone, an odd last tile the whole row), the notes right under the tiles, the flushes table, then the harvest rows with one Edit each (Delete sits inside the Edit dialog, a quiet red button at its start). Past runs are a table, each run opening its flushes and harvests |
| Farm page | Segments 7 days, 30 days, 13 weeks, 12 months over a bar chart in `--s-harvest` (day, week or month bars); tiles; By room and By crop; Export CSV and myGAP sheet |
| Energy per kg | (2026-11-05, the Business audit: "Cost per kg" until then.) The tile and the Past runs column are **Energy per kg**: the room's electricity and water only, at today's prices ("Energy per kg is at today's prices." under the tiles). The whole cost per kg (blocks, wages, rent, shared costs) is Costs' **Cost per kg**: one name for each figure |
| Profit line | (2026-11-05, the Business audit.) This run: under the blocks line, "Profit so far RM 260.00 · Costs" ("Loss so far RM 340.00" for a loss, in words) from `GET /api/costs/summary?run=`, read with the harvests under the same stale-answer token and again on the `costs` and `sales` events; the blocks line's look (`muted`, `fs-sm`, the whole line a link to `#/business/costs`); hidden while Costs has nothing for the run or works its energy out |
| myGAP sheet | `#/harvest/sheet`, a print page in light colours with no top bar: the 4-6 form's columns, the sales cells blank to write in, a "Farm:" line left blank (the app does not know the farm's name); the Farm line is 40ch, or a phone's whole row (its div's basis, as the Batches sheet's), so 390 px has no sideways scroll |
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

### Business
(2026-11-05, the integration of Batches, Inventory, Sales and Costs; contract `~/.claude/task-logs/business/CONTRACT.md` 6.) One top-bar entry for the six business pages. Where each part lives:

| Part | Design |
|---|---|
| Entry | **Business** in the top bar after Harvest and before Overview, a briefcase line icon (24 px grid, 1.8 px stroke in `currentColor`, no colour of its own: the Picture Rule); `#/business`; current on every `#/business/…` page, sheets too, as `aria-current="true"` (the section it is in; the strip's tab is the page, `"page"`; joint audit 2026-11-05). Its sizes are the Navigation Rule's |
| Landing | `#/business` is the Summary tab itself, always (2026-11-06, the Business summary: the memory of the last tab, `farm.business`, is gone); the other tabs' addresses are as before |
| Tab strip | Summary · Batches · Inventory · Sales · Costs · Runs, in that order, above the page's head: the room page's underline tabs as they are (`.room-tabs`; `web/business-tabs.js`, a `nav` named "Business"), the current one in `ink` on the 2 px `accent` line. On the six pages only: a batch, an item, Count stock and a run keep their back link, and a sheet for print (4-2, 4-5) has none (Runs: 2026-11-05; Summary: 2026-11-06) |
| Pages | Each module's page mounts as before, into a `.bz-page` box under the strip (`web/app.js`); the modules do not know the strip is there |
| Harvest tab | This run: under the run's head, a `muted` `fs-sm` line from Batches' `batchLineFor` ("Blocks · Agro Supplies · spawn batch 0912 · 950 blocks · RM 2,185.00"; "Blocks · 2 batches · 1,200 blocks" for several), the whole line a link to the batch (or the run's batches) in the line's tone with an `axis` underline, `ink` on hover. Read with the harvests and again on the `batches` event; no batches, no line |
| Shared look | (2026-11-05, the joint Business audit.) One look on the four modules, in the `.bz-` block; `web/app.js` marks the view `.bz-view` on every business page but a sheet. **Card title** 14 px 600 on every card (`.bz-view .card h2`), never 16 px. **Head buttons** and button links 36 px (44 px on a phone), a link a resting button (`raised`, 500); not the range control's segments nor Costs' month steps. **Width**: every page as wide as the main column, as Batches; a table that needs a measure caps its own card. **Quiet row action** (`bz-quiet`: Edit, Record a check, Mark unpaid, Remove): no fill, a resting `border-strong` edge, 14 px `ink-2` 500, 36 px (44 px on a phone); hover fills it with `band` in `ink`; the module's own class keeps where it sits. **Dialog footer** (`form.bz-form`, Batches' `form.bt-form` too): Cancel and the primary stick at the dialog's foot on `surface` over a hairline while a long form scrolls (as Simulate's), at every width; on a phone a destructive aside (Delete this …) takes its own row above them |
| Styles | The `.bz-` block at the end of `styles.css`, tokens only |

### Batches
(2026-11-05; spec `docs/superpowers/specs/2026-11-05-batches-design.md`; revised the same day after the UI/UX audit, `.impeccable/critique/2026-11-05T05-00-34Z__web-batches-page-js.md`, and after part 2's reviews: the next step, sticky footers, the floor's defaults.) `#/business/batches`. Where each part lives:

| Part | Design |
|---|---|
| Page | Head: Receive blocks (primary), Make blocks, Recipes, Export CSV, myGAP 4-2 sheet; the line under the title covers bought and made blocks. Waiting (made batches still making above the waiting ones, their status line as the row's words and their next step as a quiet button: Record a load, Record the inoculation, Ready to fruit, Put into a room), In rooms (a group per room's current run, the room a link to its Harvest tab) and Past (a range control 90 days · 12 months · All; on a phone each batch a block of labelled figures). Each card says "Loading…" until the first read; the empty Waiting teaches: "No blocks waiting. Receive blocks when a delivery comes in." |
| Batch row | The crop picture, "Grey oyster blocks" as a link whose hit area is the whole row (a stretched `::after`; the action above it), a muted line (supplier · received · days ago, a date and "40 days ago" never broken at a wrap), the good blocks at the right ("1,180 of 1,200 good" after a loss), and the action: **Put into a room** (Waiting; with no good block no button, only "Every block was lost"), a making row's next step (quiet, on one line: the action column 11.5 rem) or a quiet **Record a check** (In rooms), the quiet ones Business's quiet row action (`bz-quiet`, a resting edge). Waiting and In rooms share the column widths, so the counts line up. At least 44 px tall |
| Past row | The whole row opens its batch; Lost "—" for none |
| Over-count | More batch blocks than the run's is said in amber on `--warning-soft` (a check, not a fault), always on a card's surface (4.5 : 1 in light) |
| Batch page | Head: "800 Grey oyster blocks", the figure line "788 good · 12 lost" (600, tabular), "Received 2 Nov · Agro Supplies · In Container 1" with the room a link to its Harvest tab; Put into a room or Take out, and Edit (Delete inside it, a quiet red button at its footer's start, as Harvest's; a placed or past batch's confirm says its run's block cost and BE change). From 900 px two columns, Details and Delivery left, Contamination and This run right; on a phone Contamination comes first |
| Made batch | Title "400 Grey oyster blocks · made", the status line under it ("Mixed 3 Nov", "Sterilised 3 Nov", "Inoculated 4 Nov", "Incubating since 4 Nov · day 12", "Ready to fruit"); Edit (named "Edit this batch") opens Edit the mix, with Delete at its footer's start; while making, Put into a room is primary only once it is the next step |
| Making card | One card in the left column, a section per step (Mix, Sterilise, Inoculate, Incubate) under hairlines: at the top while the batch is making, at the bottom once done (DOM order). Each step an h3 (`fs-sm` 600 `ink-2`, under the card's 14 px title) with its buttons at the right and what was recorded under it in `ink-2` ("Not yet." when nothing); the next step's button is the card's one primary, the other Records plain while making and quiet once made, every Edit quiet; a step that cannot be done yet has its button `aria-disabled` (55 %, no hover, Tab reaches it) and keeps its reason in words; the loads a row each with a quiet Edit; "300 of 400 bags sterilised", or once inoculated with none "No load recorded: 250 bags inoculated without a sterilising load", in amber on `--warning-soft`; the price note under the steps: muted on how the price per block comes about, amber on `--warning-soft` when it came to over RM 1,000 a block, and without Inventory "The price per block is worked out once Inventory has the materials and their purchase prices." |
| Recipes | A dialog listing the recipes in use (name, then "Grey oyster · Sawdust 78 % · … · 2.30 kg a bag", each name kept with its %), a quiet Edit and "Archive…" 16 px apart (on a phone Edit at the row's start, Archive… at its end), Add a recipe (primary, the first focus); the recipe dialog shows the parts' live sum under them ("Sum 98 %"), the target "of 100 %" only while the sum is off |
| Make blocks | Groups The mix, Weight, Materials (a box per material, its Inventory item beside it once the line has an amount, only items of the line's unit; the spawn line only spawn items; two columns from 360 px; the other ingredient behind a quiet "Add another material" unless it has one), Note; a recipe fills the crop, the amounts and the weight, and bags, bag weight or water typed work the amounts out again; the water guide under Materials' hint follows them. A line drawing on an Inventory item for more than it has in stock (`GET /api/batches/stock-items` `qty`; an edit's own amount counts as there) gets an amber note under it, "More than the 460 pcs in stock" or "None in stock": told, never refused, as Inventory may be counted later (joint audit 2026-11-05); the Inoculate dialog's spawn line too |
| This run | A placed or past batch's run, as Harvest's tiles: kg so far, kg per block, BE, then "Blocks cost RM 11.50 per kg picked" in a muted line: the run's block cost (`GET /api/batches?run=` `blockCost`, read with the harvests) over the run's kg, so it matches Costs (joint audit 2026-11-05; it was this batch's price over the kg per block); a mixed run's "The run's blocks cost …", the whole run's; no line while a price in the run is unknown. "No harvests in this run yet."; not shown for a deleted room |
| Dialog footer | The Batches dialogs (`form.bt-form bz-form`): Business's dialog footer (Shared look): Cancel and the primary stick at the dialog's foot on `surface` over a hairline while a long form scrolls (as Simulate's); on a phone a Delete at the footer's start takes its own row above Cancel and Save |
| Floor defaults | Record a load: the bags not yet sterilised and the last load's method, temperature and hold. Record the inoculation: the spawn supplier and strain of the last made batch of the crop; Amount and Counted in a short pair |
| Dialogs | Receive and Edit: section heads (`fs-sm` 600 `ink-2`, a hairline above) over The blocks, Spawn, Weight, Paperwork; pairs side by side from 600 px (Received and Blocks, Spawn batch No. and Strain, Block weight and Water). Put into a room names each room's blocks in batches. Record a check starts on Blocks lost |
| Today | A **Blocks waiting** card, as Long-term: "400 Grey oyster blocks waiting 40 days", each a link, for batches waiting 3 days or more |
| Links | Neutral `ink`, a `muted` underline (3 : 1 or more), the full ink on hover; one card-title size (14 px) |
| Numbers | Money as Harvest's (RM 2 decimals, grouped), blocks grouped |
| Sheet | The myGAP 4-2 sheet reuses the 4-6 sheet's print rules; a caption and row heads for screen readers, the app's date boxes, the Farm line at most a phone's width; a made batch's rows say "made 5 Nov" and "made on the farm" |
| Styles | The `.bt-` block |

### Inventory
(2026-11-05, business module, under Business since the merge; spec `docs/superpowers/specs/2026-11-05-inventory-design.md`; four pages under `#/business/inventory`, styles in one `.iv-` block at the end of `styles.css`, tokens only.) Where each part lives:

| Part | Design |
|---|---|
| List (`#/business/inventory`) | One card per kind (Blocks, Spawn, Bags, Chemicals, Packaging, Other), a table Item (its one pill right after the name), In stock, Reorder at, Last counted; the pill is the worst: **Expired** red (`warn`; "4.50 kg expired" when only part of the stock is), **Low** and **Use by 12 Nov** amber, **Archived** grey; items with a pill first in their card. Columns are fixed from 900 px (`table-layout: fixed`: Item at most 26rem or 40 %, In stock and Reorder at 130 px, Last counted the rest) so every card lines up and the figures sit right after the name; the page is full width as the other Business pages (2026-11-05, joint audit: the 1,040 px cap left the head short of the strip). Archived rows are `muted`. The whole row opens the item (the name stays the real link); the row tints on hover only where hover exists. Buttons: Record use (primary), Purchase, Count stock, Add item, and the quiet "myGAP 4-5 sheet" link; Record use and Purchase stay off until the list has loaded, and while there is nothing but block items to use or buy. Count stock (a link) takes the buttons' `raised` fill and 36 px. An empty farm shows a dashed card with Add item, the one button (the head's tools hidden); "Every item is archived." has a link that shows the archived ones |
| Saved line | (Audit #2.) After a record, under the attention line (the list) or the head (an item's page): what was saved, `muted` `fs-sm`, a polite status line, "Used 1.00 L of Bleach in Container 1 by Sara · **Undo**" (Undo a quiet underlined button in `ink`, 44 px on a phone) for the minute after a new purchase, use, throw-out or count; "Undone" after it; "Saved" or "Deleted" alone after an edit or a delete. The task grid's Undo line, for stock |
| Attention line | Above the cards, only when there is something: "2 low · 1 to use by 12 Nov · 1 expired" in the same tones, each part a quiet toggle (dotted underline, solid and 2 px when pressed; at least 44 × 44 px on a phone) that filters the cards to its items. Last counted over 7 days or never is muted words, never amber (a reminder, not a fault: the State-Only Colour Rule) |
| Phone (600 px and under) | The table head is gone; each row is a block: the name and pill on the first line, In stock at the right of it, then one muted line, "Reorder at 2.00 L · counted today". Tool buttons two to a row at 44 px |
| Item page | Tiles In stock, Reorder at, Last counted; the In stock figure keeps its ink unless the item is Low (amber: Low is about the whole figure); under it "Low", then the use-by part in its own tone, "4.50 kg expired 1 Nov" red or "3.00 kg use by 12 Nov" amber (audit #4: a whole red figure read as all of it expired). On a phone the tiles are two a row, the odd last one taking the row. An archived item shows the grey Archived pill and a muted line under its name. Lots (From: "1 Sep", "Batch 14", "Count 3 Nov"; qty, left, use by with its pill "Expired 1 Nov", **Throw out** on a soon or expired lot; another year's day with its year; on a phone Qty is dropped, "Left" is written before the figure and a lone "—" use-by is not shown); History newest first, 20 then "Show all N", one grid template for every row (what and when · the signed qty, 13 ch · Edit, 4.5 rem) so the figures line up, one quiet Edit a row (`bz-quiet`; a count: Delete; a batch move: none, the card's head saying once "Batch records change in Batches", muted, Batches a link); on a phone the qty sits on the first line, Edit under it. (2026-11-05, joint audit B2) A batch is named as Batches names it and links to it (`web/inventory-math.js` `batchTitle`; the server reads the batch's row): "1,550 Grey oyster blocks from Kulim Mushroom Supply · received" (a receipt: the delivery's blocks), "950 Grey oyster blocks from … · into **Container 1**", "400 Grey oyster blocks · made 24 Oct" (a made batch's blocks in), "Used for 400 Grey oyster blocks · made 24 Oct" (a material on a making day), and a lot from a batch the same in From; "Batch 14" with no link when the batch is gone. A room in a line ("Used in Container 1", "into Container 1") links to its Harvest tab; the links are `ink` with a `muted` underline (`.iv-ref`, as Batches' names). (B1) A block item's page has no Record use, and says under its name "Blocks come in and go into rooms through **Batches**." (a link). The item page and Count stock (pages of their own, with a back link) are capped at 1,040 px, head and cards on one right edge |
| Count stock | `/count`, a page of its own: a box per item not archived, by kind, beside "By the records 3.50 L", the unit as a suffix; the keyboard is numeric for pcs, g, mL and blocks and decimal for kg and L. Who counted once at the top; with no worker names the dialogs' line "No names yet: add the workers' names in Settings first." sits above the boxes (Settings a link), so nothing is typed in vain. Save counts sends the typed boxes (an empty box is skipped). A live refresh changes only the records' figures and the unit, never a typed box; an item archived or deleted meanwhile is disabled (its box at 55 % on `band`) with "No longer on the list since you opened this page" and left out of the save. A typed figure shows its difference after the records, "By the records 1.50 kg · −0.25 kg" ("matches"), amber when over half the records' figure: a question, as Record anyway. "Loading…" until the first reply; a failed first load is retried by Retry and by the next live refresh. Typed boxes are kept in the tab until a save ("Your unsaved counts are back. Clear them") and leaving with some asks first; on a phone Save counts sits in a bar stuck to the screen's foot (`page` behind it, a hairline above) |
| myGAP 4-5 sheet | `/sheet?days=30` (30, 90 or 365 days in the address); the Period line says its dates at once, as the Batches sheet's ("8 Aug 2026 – 5 Nov 2026"), the table a caption for screen readers; prints as the Harvest 4-6 sheet does, light colours and no top bar, twelve columns (a phone scrolls it sideways; the Farm line stays within the page), the write-in cells blank, 6 empty rows after the records and "Sheet reviewed by: ____ (Management) on ____" at the foot; in print each column has its mm width (fixed layout) and the page margins are light whatever the theme. A failed load hides the table, so the old period's rows are never shown under a new one |
| Settings card | One checkbox, "Send low-stock and use-by messages to Telegram", saved as soon as it changes; it stays enabled (and focused) while saving and further changes are ignored until the reply; the note says nothing is sent while Telegram is not set up, its lines capped at 60 ch |
| Dialogs | The tasks' `openForm`, as Harvest's, the form `bz-form` (the footer stuck at the dialog's foot on a phone; DESIGN "Business"). Record use leaves block items out of its Item picker and the server refuses a use of one (409 "Blocks go into a room from Batches: Put into a room"): blocks go into a room only through Batches' Put into a room; Count stock may still correct them (2026-11-05, joint audit B1); the unit inside the qty box (and ", in litres" for a screen reader), the keypad numeric for whole units; "RM" inside the Total paid box before the figure (a prefix, 40 px in); Day bought and Use by stacked under 420 px; a quiet red "Delete this item" on an item with no records |
| Figures | One formatter (`web/inventory-math.js`): kg and L to 2 decimals, pcs, g, mL and blocks whole, "−" for under 0, RM to 2 places, "RM 8.33 per L"; a number keeps its unit at a wrap |

### Sales
(2026-11-05, owner: what the farm sells, to whom, and what is owed; spec `docs/superpowers/specs/2026-11-05-sales-design.md`.) `#/business/sales` (`?days=7|30|90|365`, 30 without one), a page of the Business group, under Business since the merge. Where each part lives:

| Part | Design |
|---|---|
| Head | "Sales", the line "What was sold, to whom, and what is owed.", the period as Harvest's segmented control (7 days, 30 days, 13 weeks, 12 months), then **Record a sale** (primary), **Buyers**, **Export CSV** and **myGAP 4-6 sheet** (Harvest's sheet, which holds the sales too, for the same period; 2026-11-05, joint audit B4), the links as tall as the buttons (the Business head buttons, 36 px, 44 px on a phone). On a phone the period is one row at 360 px (each segment as wide as its words, 6 px in) and the four buttons two a row |
| Totals card | Titled with the period's dates ("6 Oct – 4 Nov 2026"). Three tiles: **Sold** (kg, "of 64.5 kg harvested"; no line when nothing was harvested in the period), **Income** (RM) and **Owed**. Owed is all time: its line reads "3 sales · oldest 12 days", starts with "all time" when the period is shorter than the oldest unpaid day, and reads "RM 0.00" with "All paid" when nothing is owed, or "Nothing owed" when nothing is owed and the period has no sales |
| Owed card | Only when something is owed. One row per buyer, most owed first, a hairline between buyers: the name (a quiet underlined button, 44 px), the RM owed, the oldest in days. The name opens that buyer's unpaid sales under it: date, the lines in short, total, reference and **Mark paid**. From 900 px the rows sit in a 52rem measure as columns (name, RM owed, "oldest 12 days") and the open sales as fixed columns (day, lines, RM, reference, **Mark paid**), the RM owed and the sales' RM on one right edge. Below 900 px the RM owed is at the right with "oldest 12 days" under it; an open sale is day and RM, the lines, then reference and **Mark paid** |
| Sales list | The period's deliveries, newest first. The columns are the list's (`.sl-list`), each delivery a subgrid of them, so every column lines up from row to row. From 900 px one row: date ("Thu 5 Nov", 22 px clear of the buyer, both bold), buyer (8 to 14rem), the lines in short ("Grey oyster 12.00 kg · Pink oyster 4.50 kg", at least 14rem) with their rooms in a `muted` `fs-sm` line under them (2026-11-05, joint audit B3: "Container 1", a link to its Harvest tab in the line's tone with an `axis` underline, or "Mixed"; lines from several rooms each room once with its crops, "Container 1: Grey oyster · Mixed: Pink oyster"; `web/sales-math.js` `roomsOf`), total RM (right-aligned, tabular figures, one right edge), the paid mark, the reference (muted, up to 8rem) and one quiet **Edit** (`bz-quiet`). Below 900 px a block: date and buyer, the lines, total and mark, the reference on its own row, **Edit** at the right; the date and total share a first track of at least 6.5rem so the mark starts at one place. A crop's part of the lines never breaks inside it ("Lion's mane 2.20 kg" kept whole; a break only after a dot). The latest 20 (10 on a phone; crossing 600 px repaints to the other count), then **Show all N** (the first new row takes the focus, with the accent ring). Long buyer names and references wrap, they do not push the row wider |
| Paid mark | Text: "Paid 9 Nov" in the ink, "Unpaid" in `warning-text` at 600. Never colour alone |
| By crop | A table: crop (picture and name), Sold, Harvested, Income, Average RM per kg, Expected RM per kg. The price got against the expected is said in words under the average ("RM 1.20 under expected", "RM 0.80 over expected", "as expected"), with no colour verdict: a muted `fs-sm` line on a phone, hidden from 601 px where the two price columns sit side by side. On a phone Sold, Harvested and Expected are left out (the sold kg a muted line under the crop's name, "98.8 kg sold") so the table fits 390 px with no inner scroll; figures at least 10 px apart; "RM per kg" in a head never breaks ("Average / RM per kg") |
| By buyer | A table: buyer, kg, Income, Owed (all time). Hidden when the period has no sales. On a phone the kg column is left out and said as a muted line under the name ("69.5 kg") |
| Empty | No sales in the period: the totals stay (Sold "0.0 kg", Income "RM 0.00"), the list says "No sales in the last 30 days." (the segment's words), By buyer hides and By crop shows only the crops harvested in the period. No buyers at all: "No buyers yet. Record a sale to add the first." with a plain **Record a sale** under it (it opens the dialog) |
| Focus | A repaint (a live event, a save, Show all, opening an Owed row) keeps the focus on the same control: Edit, Mark paid and the Owed name carry a `data-focus-key` and the page refocuses it after drawing. A dialog gives the focus back to the button that opened it |

| Dialog | Design |
|---|---|
| Record a sale / Edit sale | Its own dialog (`.sl-dialog`, 880 px wide from 900 px), not Harvest's; its form, as every Sales dialog's, `bz-form`, so Record stays in reach on a phone. Fields: **Date** (today by default, the day in words under it), **Buyer** (the active buyers A to Z, then "New buyer…"), **Buyer's reference** (optional), **Note** (optional), then the lines. Record opens on a chosen, disabled first option "Pick a buyer" with the cursor on it, and no price is filled until a buyer is picked; Edit shows the sale's buyer. With no buyers it opens on "New buyer…". From 900 px the form is two columns: Date and Buyer, then Reference and Note; the new-buyer boxes, the lines, the foot, the paid line, the form's error and the buttons the width of both, so a three-line Record at 1440 × 900 shows its primary without a scroll. The title takes the focus on an Edit with no ring |
| New buyer in place | "New buyer…" opens two boxes under the picker, name and phone; the buyer is made with the sale. Two a row on the form's columns (16 px apart), one a row on a phone |
| A line | **Crop** (the crop list in its order, a crop used on another line left out), **kg**, **RM per kg** (the "RM" mark at the left of the box), **Room** (a room by name, or "Mixed"), the line's total at its end and **Remove** (with two lines or more). **Add a crop** under the lines (off at 9 lines or when every crop is used). On a phone Crop has its own row ("Milky (Calocybe indica)" whole), then kg and RM per kg (kg the narrower), the amber note, then Room beside the total and Remove; from 601 to 899 px a line is two boxes a row; from 900 px one row (Crop at least 13.5rem, kg the narrowest, RM per kg at least 10.5rem so "expected" fits with RM 1000.00, Room at least 7.75rem for "Container 1"), with the labels said once above the first line and the boxes on shared rows (label, box, error) so they stay level |
| The "expected" mark | A price filled from Settings → Yield shows the muted word "expected" inside its box at the right end (as kg's unit; `fs-sm`, in the box's `aria-describedby` while shown) until the box is changed. A buyer's usual price fills with no mark. A typed price is never overwritten |
| Amber question | An unlikely value (RM per kg over 3 times the crop's expected price, or kg over 500) is asked once, in amber as a note the width of the line under it (`.sl-line-check`, polite live region, in the box's `aria-describedby`; the box keeps its amber border) ("That's 3.4 times the expected RM 12.00 per kg. Is RM 41.00 right?"), and the primary button reads "Record anyway" ("Save anyway"). The same values sent again go through; a changed value is asked again. The label goes back to plain after a send and on any change to a line |
| Foot | The delivery's kg and total ("16.50 kg · RM 214.50"), right-aligned, above the buttons |
| Edit | The same dialog with a quiet red **Delete this sale** at the start of the footer (it opens a confirm). An edit keeps the sale's time unless its date changes (then 12:00). A paid sale shows "Paid 9 Nov" and a quiet **Mark unpaid** |
| Mark paid | A small dialog with **Paid on** (today by default), its lead naming the sale ("Wed 4 Nov · Restoran Wong Kitchen Sdn Bhd · RM 232.50"); opened from the Owed card and from the Edit dialog |
| Buyers | **Buyers**: a list, each row with name, phone, the usual prices in short and the owed sum, and **Edit**; archived buyers under an "Archived" heading, muted, with **Restore**; **Add a buyer**. Edit: name, phone, note and a usual-price box per crop (two or more a row); at its foot a quiet **Archive**, or **Delete buyer** when the buyer has no sales (it asks first). A buyer with sales cannot be deleted: archive instead. Save, Archive, Restore and Cancel (or Esc) in Edit / Add a buyer come back to the list with the cursor on that buyer's **Edit** (**Restore**); after a Restore or an Archive a polite status line at the top says "Kedai Ah Seng restored." ("… archived."). The usual prices' unit is in the group's legend ("Usual price (RM per kg)") |
| Held while sending | Cancel, Delete this sale, Archive and Restore are held while a request is out. A late answer from a closed dialog goes to the page, not to the dialog |

| Other | Design |
|---|---|
| Classes | One `/* ---- Sales ---- */ ... /* ---- end Sales ---- */` block at the end of `web/styles.css`, classes `.sl-`, tokens only. It reuses `.field`, `.tk-suffix-box`, `.tk-group-fields`, the cards, tiles and tables of Harvest |
| Sizes | 390, 768, 1024 and 1440 px, both themes. Phone targets 44 px. Breakpoints 600 px (phone tables, one-column new buyer) and 900 px (the list as columns, the dialog's line in one row) |
| myGAP sheet | The 4-6 sheet adds a row for each sale line, after its day's harvest rows: Date, Crop, Block / location ("Room 1 · run of 3 Oct" or "Mixed"), Sold (kg), Price / kg (RM), Total (RM), Invoice No. (the buyer's reference) and Buyer. The harvest rows' sales cells stay blank. The Total row adds sold kg and RM. If the sales cannot be read, the harvest rows stay and a line above the table says "Sales could not be read: the sales columns are blank." |
| Words | RM "RM 1,240.50", kg to 1 decimal in totals and 2 in a line, a price "RM 12.00", days "12 days", "1 day", "today". Harvest's figure is **Expected value** (not "RM value"); Sales' is **Income**: one name for each figure |

### Costs
(2026-11-05; spec `docs/superpowers/specs/2026-11-05-costs-design.md`.) `#/business/costs`, under Business. Where each part lives:

| Part | Design |
|---|---|
| Head | "Costs", a month stepper (‹ November 2026 ›, 44 px buttons, the next one off at this month; stepping keeps the page and its focus; "Loading…" with both arrows off until the first answer), **Add a cost** and **Export CSV** (`GET /api/costs.csv?month=`: the month's cost lines and sales by date, the measured electricity and water per room and run last, the BOM and the formula guard as the other CSVs) |
| Month card | Profit first, in display size (32 px, 28 px on a phone, its own row there); then Income, Costs, Cost per kg, Profit per kg. A loss is "−RM 340.00" in the critical text token with the word "Loss" under it, never colour alone; a negative profit per kg takes the same tone. "Nothing sold" under Income and Profit per kg when nothing sold, else "683.0 kg sold" and "on 683.0 kg sold". While the energy is worked out the four figures it feeds read "—" with "working out" under them, and one note "Working out the energy cost…" leads the notes. On a phone one long figure sets the four a size down. Notes under the tiles: missing prices in the warning text token, the rest muted; on this month the last says what the monthly items still charge: "Still to come this month: RM 3,529.00 (2 wages, internet)" (the month's costs are those charged so far) |
| Months chart | Its svg's name sums the months up for a screen reader ("…: 3 months with a loss, 9 with nothing recorded. Highest October 2026, loss RM 1,168.10. Lowest …"). Its title follows the months kept and shown: "Profit, last 12 months (RM)", "last 11 months" when only 11 are kept, "last 6 months" on a phone. Bars up from one zero line for a profit (`--good`), down for a loss (`--critical`), one scale both sides, bare tick numbers; the shown month outlined; every bar's value printed when its slot is 60 px or more (else the shown month's only); a pending month a hatched stub with a dashed edge; "No figures yet." when nothing is recorded. One Tab stop, ← → Home End move; a phone shows 6 months when 12 would be under 24 px a bar |
| By category | Category, RM, share; the source in a muted line (from Batches, from Inventory, measured, bill − measured, entered), "from Batches" and "from Inventory" links to their pages; a Total row equal to the Costs tile |
| Entries, Monthly items | Rows on a desk (date, what, for whom, RM, a quiet Edit; a "monthly" or "bill" tag; a bill's "adds RM 580.00 unmeasured" line, "… unmeasured to October" when its period ended in another month); blocks on a phone or in a column under 560 px. Monthly items line up on a subgrid with Change and Stop, the names taking the room (for whom fits its words up to 9em), each with its charge day in a muted line under its name ("on the 25th · next 25 Nov"). Edit, Change and Stop are the Business quiet row action (`bz-quiet`) |
| Runs | Dates (a toggle that opens the run's breakdown under it, no side stripe; two columns on a phone), Container (a link to its Harvest tab), Crops (the main crop's 24 px picture before the names, as Harvest's By crop), Income, Costs (with "Some costs have no price" when so), Profit, Profit per kg; labelled blocks on a phone. A loss keeps its minus and only the figure takes the critical text token, Profit with "Loss" under it in the line's tone (the month card's way). The breakdown's Blocks links to the run's batches. Under the table one muted line: "Shared costs (rent, wages, …) are split over the runs by block-days." Links: neutral ink with a `muted` underline (`.co-link`, as Batches' names) |
| Dialogs | The tasks' dialog: the boxes follow the category (worker for labour; for utilities Kind, Bill from, Bill to, then Amount with the bill's line under it, the period filled from the date's month); amounts in their boxes grouped ("1,800.00"); a room cost says where it lands; a bill says only the unmeasured part is added. Stop defaults to this month and names the charges a past month removes; a Stop that removes charges is a Danger button ("Stop and remove 1 charge"), blue again when nothing goes. A monthly item's Change dialog: Stop quiet, only "Delete this item" red. Every Costs dialog's form carries `bz-form` (the Business sticky footer on a phone) |
| Layout | Two columns from 900 px (Entries and Monthly items, By category); one column below |

### Runs
(2026-11-05; spec `docs/superpowers/specs/2026-11-05-runs-design.md`; the fixes of the same day from the server review, the design review and the technical audit.) A run of blocks from every module's side: the **Runs** tab, `#/business/runs` (`?crop=`), the fifth tab of the Business strip, and a run's page, `#/business/runs/<id>`. Read only: each figure is changed in the module that keeps it. Where each part lives:

| Part | Design |
|---|---|
| Runs tab | "Runs" with a **Crop** select (All crops, then each crop; Calendar's labelled select), kept in the address in place (the table's caption follows it). A table: Run (the row's name and its link to the run page: the container and Costs' run days, "Container 1 · 24 Sep – now", "Container 1 · 24 Sep – 20 Dec"), Crops (the main crop's 24 px picture before "600 Grey oyster", as Costs' runs), kg, kg per block, Income, Costs, Profit, Profit per kg; the open runs first, then the ended ones, each newest started first. A loss keeps its minus and only the figure takes the critical text token, with "Loss" under Profit; "working out" under Costs while the energy is worked out, "Some costs have no price" when so. On a phone each run a block of labelled figures: the container and days its heading (a 44 px tap) with Profit beside it, Crops across, then three a row. Under the table Costs' shared-costs line. Empty: "No runs yet. A run starts when a container gets its blocks on its Crop tab." or "No runs of Pink oyster." |
| Run page head | A back link "Runs"; the title "600 Grey oyster blocks" ("300 Grey oyster and 100 Lion's mane blocks"); under it "Container 1 · since 4 Nov" ("· 4 Nov – 20 Dec" when ended; "recorded since …" for a run under way at the harvest upgrade), the container a link to its Harvest tab (plain words "A deleted room" for a room that is gone). No strip on a run's page |
| Money and yield | Costs' tiles (`co-tiles`), seven: **Profit so far** in display size on its own row ("Profit" once the run ended), then Income ("40.0 kg sold" or "Nothing sold"), Costs, Profit per kg ("on 40.0 kg sold"), Picked ("88.0 kg not sold"), kg per block, BE: three and three, two a row on a phone, never one tile left alone. A loss as on Costs' month card. While Costs works the energy out, Profit, Costs and Profit per kg read "—" with "working out". Under the tiles one muted line says what the costs are made of: "Blocks RM 3,040.00 · Own RM 480.00 · Shared RM 14,359.23 (80 % of costs) · Electricity and water not recorded yet" (the parts over 0, the biggest with its share), then Settings → Yield's missing figures (Harvest's line) |
| Cards | One column; from 900 px a grid of two (3 : 2): Money and yield beside Costs, Harvests beside Blocks, Sales across; each card its own height (`align-items: start`), never stretched to its neighbour's. **Costs** (right after the money): Costs' run breakdown (Blocks a link to the run's batches, Electricity, Water, Own costs, Share of shared costs; Electricity and Water kept at 0 in muted words, "not recorded yet" when Settings has a price, "no price set" without), Total, its notes ("Working out the energy cost…" first while pending), the shared-costs line; head link Costs. It holds the run's one block-cost figure. **Blocks**: each batch a link to its page ("600 Grey oyster blocks", then "Agro Supplies · received 28 Sep · RM 2.50 a block"; a made batch "made 20 Sep · RM 1.29 a block" and "Its materials count in Costs as Inventory purchases"), no money total; head link Batches (the run's batches). **Harvests**: Harvest's Flushes table, By crop for a mixed run (the yield per crop; the money is the whole run's), the latest 3 picks (no Edit) and "All picks on the Harvest tab". **Sales**: the run's sale lines, newest delivery first and a delivery's lines in the order entered (Day, Buyer with its reference, Sold, RM per kg, Total, Sales' paid mark) and "Sold 48.0 kg · RM 576.00"; on a phone each line a block, its day with its Total beside it, Paid a line of its own; head link Sales. Card head links: Costs' `.co-link` |
| Tables | The Runs table and the Sales table become blocks on a phone, so they keep ARIA roles (`table`, `row`, `rowheader`, `cell`), named by their caption; a block's label has an empty alt text (`content: attr(data-label) / ""`), read once from its column. Where a table still scrolls sideways (over 600 px), its box is a region named by the caption with a Tab stop |
| Taps and focus | Up to 600 px every `.co-link` on a run's page reaches 44 px (block padding over its line) and the Runs rows' link is a 44 px row. A live repaint keeps the cursor on the same link or box (its address and words, or its focus key) |
| Links in | Harvest's This run head ends "· Run page", and a past run's fold starts with "Run page"; Costs' run breakdown ends with "Run page": each `.co-link`, named for its run ("Run page, Container 1, since 24 Sep"). Harvest's "Profit so far … · Costs" line opens the run page (its Costs card links on). Batches' room head "run since 4 Nov" is the link. Sales names rooms, not runs: no link there |
| Gone | The title "Run", "No such run. A container's runs go with it when it is deleted." with "Back to Runs" (`.co-link`; the head's back link hides: one way back); the page stops asking. A failed first read titles the page "Run" too |
| Live | Both pages ask again on the `harvest`, `batches`, `sales` and `costs` events, a room's crops or name, the stream's return and a 60 s timer; no event of their own |
| Styles | The `.rn-` block at the end of `styles.css`, tokens only; everything else is the other modules' classes |

### Summary
(2026-11-06; spec `docs/superpowers/specs/2026-11-06-business-summary-design.md`.) The **Summary** tab, `#/business`, the first tab of the Business strip and where the top bar's Business always opens: this month's money, what needs the owner and the runs in progress, composed from the modules on each read. Read only. Where each part lives:

| Part | Design |
|---|---|
| Head | "Summary", "This month's money, what needs you and the runs under way." The page's title "Business summary" |
| Money | A card across the top titled "November so far" (head link **Costs**): Costs' month tiles Profit (display size, its own row on a phone), Income, Costs, as Costs words them (a loss, "working out", "Some costs have no price"); under them, muted, "140.6 kg not sold yet, about RM 4,921.35 at your expected prices" and last month's result "October: loss RM 1,508.00" ("profit RM …", "nothing recorded", "working out"). The figures are Costs' own (`monthView`), so they always match it |
| Needs you | A line per thing to do, each line its own link (`.co-link`) to where it is fixed, in this order: money owed (Sales), stock below zero, stock low (Inventory), a use-by within 7 days or past (one line per item, to its page), blocks ready for a room or being made (Batches), blocks with no price this month (Batches). "Nothing needs you right now." only when every module was read; a module not read adds "Couldn't check Sales just now." |
| Runs in progress | Each open run: the main crop's 24 px picture and the container, the money so far beside it ("Profit so far RM 357.18"; "Loss so far RM 1,005.97" with only the figure in the critical text token), then "600 Grey oyster · since 4 Nov · day 3 · 20.0 kg picked · Run page" (the link named for its run, as Runs'). Head link **Runs**. None: "No runs in progress. A run starts when a container gets its blocks on its Crop tab." and a link "Rooms" |
| Layout | Money across the top; from 900 px Needs you beside Runs in progress, each card its own height (`align-items: start`); one column below in that order. Up to 600 px every link reaches 44 px (a need's line a block with 12 px over and under; the others block padding over their line) |
| Failures | A module that could not be read says so in its own card ("Couldn't read Costs just now.", "Couldn't read Runs just now."); the rest shows. No answer at all: the banner with Retry, as the other pages |
| Live | Asks again on the `batches`, `inventory`, `sales`, `costs` and `harvest` events, a room's crops or name, the stream's return and a 60 s timer; a repaint keeps the cursor on the same link |
| Styles | The `.sm-` block at the end of `styles.css`, tokens only; everything else is the other modules' classes |

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

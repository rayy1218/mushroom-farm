# Design system CSS pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `web/styles.css` (and the module blocks Batches, Inventory, Sales and Costs add) to the design system DESIGN.md now describes, so every page uses one chip, one segmented control, one table, one fold and the six radius and seven type steps.

**When:** after Batches → Inventory → Sales → Costs are merged into v2 (owner, 2026-11-05: "Docs now, CSS later"). Re-run the audit first: line numbers below are at v2 `7a0713e` and will have moved.

**Architecture:** CSS only, plus the class names in the JS that renders the parts being merged (a second chip class becomes the first). No new tokens beyond `--radius-sm` (6 px) and `--radius-track` (10 px), `--radius-segment` (7 px), `--radius-pill` (999 px). No behaviour changes.

**Tech Stack:** plain CSS custom properties in `web/styles.css`; `node --test` for the markup the JS renders; the Impeccable detector (`impeccable detect --json web/`) for the scale; screenshots at 360, 768 and 1440 px in both themes.

Branch `fix/design-system-css`, worktree `.claude/worktrees/design-css`. `npm test` before and after. Commit as the repo's configured user; never push. Never touch `data/v2.db` or ports 8080/8090–8094 (the live farm).

## The drift found (audit 2026-11-05)

Colours are clean: the only literal colours outside the theme blocks are the print sheets' black ink and the fade masks' `#000` (a mask's alpha, not a colour). The detector's "overused font" (Inter is the owner's choice) and two "side stripes" (the folds' chevrons at 907 and 1368) are false positives.

### Type

| Where (line) | Now | To |
|---|---|---|
| `.field label` 191, `.addresses legend` 391, `.tg-levels legend` 631, `.sim-fold > summary` 905, `.cp-auto .crop-check` 1011, `.sim-crop-head` 1503, `.tk-group legend` 1617, `.tk-rooms legend` 1663 | `0.9rem` (14.4 px, no phone step) | `var(--fs-md)` (Field label); then `.tk-add > button`'s `calc(0.9rem * 1.45 + 4px)` (1644) becomes `calc(var(--fs-md) * 1.45 + 4px)` |
| `.field-error` 207 | `0.85rem` | `var(--fs-sm)` |
| `.live-mark` 293 | `0.8125rem` | `var(--fs-sm)` |
| `.tg-about` 1770, `.tg-key-box` 1803 | `11px` | `var(--fs-xs)`; check the ≈ still fits the box's corner |
| `.ts-key-box` 1879 | `12px` | `var(--fs-xs)` |
| `.cp-stage-name` 946, `.cp-list h3` 984, `mimic.css` `.m-name` 82 | weight 650 | 600 |
| `.rd-num` 1177, `.hv-page … .us-kwh` 2054 | `28px` | keep (Display's phone step); a `--fs-display-phone` token if a third use appears |
| `mimic.css` 79–82 | 13 and 18 px | keep: the drawing's own units, scaled with it (DESIGN.md Room drawing) |

### Section card titles (the visible one)

DESIGN.md's Hierarchy: a card names its contents in Card title (14 px), a thing's own card its Name (16 px). Today the global `.card h2` is 16 px, so every section card outside the Now tab's `card-head` is a step large. Measured on the live app: Now tab "Control", "Machines" at the card-title step; "Upkeep", "Long-term", "This run", "Harvests", "Simulations", "Automatic control", Settings' "Readings", "Phone alarms", "Workers", "Task rules", "Yield", Overview's "Alarms", "Energy and water", "Harvest" at 16 px.

- [ ] Show the owner the Overview, Settings and a room's Tasks tab at 14 px before committing (screenshots, desk and phone): this is the one change a person will notice.
- [ ] `.card h2` → `var(--fs-md)`; the Name cards keep 16 px by their own rules (`.ov-room-head h2`, `.td-room h2`, `.cp-stage-name`, `.cal-day-title`, `.cs-name`, dialog `h2`). Settings' groups inside one card (Readings, Outdoor sensor, Prices) become Card titles with their hairline above.

### Corners

| Where (line) | Now | To |
|---|---|---|
| `dialog` 173 | `12px` | `var(--radius-card)` |
| `.skip` 260, `.room-tabs a:focus-visible` 457, `.sim-scroll:focus-visible` 870, `.sim-fold > summary:focus-visible` 910, `.sim-inputs-head:focus-visible` 1371, `.cp-step-btn` 988, `.tg-box` 1753, `.chart-host .tip` 492 (4 px) | 6 px / 4 px | `var(--radius-sm)` |
| `.rooms .name a:focus-visible` 387 (3 px), `.cp-stage-name:focus-visible` 948 (2 px) | 2–3 px | `var(--radius-sm)` |
| `.topbar .brand-top` 275, `.top-link` 279, `.top-alarm` 283 | `8px` | `var(--radius)` |
| `.range-bar` 670, `.seg` 1181 | `10px` | `var(--radius-track)` |
| `.range-bar button` 671, `.seg-btn` 1182 | `7px` | `var(--radius-segment)` |
| `.nav-badge` 692 (9 px), `.ov-chip` 716 (10 px), `.cp-mark` 955 (99 px), `.filter-bar`/`.filter-fill` 1092–1093 (5 px), `.cs-bar`/`.cs-fill` 1220–1221 (3 px) | various | `var(--radius-pill)` |
| `.pic-card .rc-pic` 1228, `.pic-empty` 1714 | `10px` | `var(--radius-track)` |
| `.tg[data-turn="phone"]` today 1792–1793 | `8px` | `var(--radius)` |
| `.empty` 135, `.missing` 495 | `var(--radius)` (8 px) | `var(--radius-card)`: empty states are cards |
| `.brand-mark` 264–266, `.swatch` 686, `.tg-key-box` 1803, `.ts-outlined::before` 1872 | drawings and scaled-down boxes | keep (DESIGN.md Shapes) |

### One part, not two

| Part | Now | To |
|---|---|---|
| Segmented control | `.range-bar` (History, Exchange, Harvest) and `.seg` (Auto \| Manual), the same rules twice | one class (`.seg`), `aria-pressed` on both |
| Level chip | `.al-level` (2 × 8 px, pill), `.ov-chip` (1 × 8 px, 10 px corners), `.cp-mark` (2 × 10 px, 700), `.ec-tag` (Economics' source tag, the Mark chip at 600: 2026-11-10 audit #16) | one `.chip` with `data-level` and `data-kind="mark"`; `.alarm-chip` and `.nav-badge` are dead CSS (no JS renders them): delete |
| Sub-line | A muted line under a figure or a name, the same rule restated: `.co-sub`, `.co-source`, `.iv-sub`, `.hv-without`, `.ec-way-room` and `.ec-sub` (`display: block`, `muted`, `fs-sm`; Economics' `.ec-block-label` at `fs-xs`) (2026-11-10, the Economics audit #17) | one `.sub` rule |
| Count | `.tab-count` and `.top-count`, the same rules twice | one `.count` |
| On/Off switch | `button.toggle` (76 × 40 px: Setup, aircon panel, Task rules) and `.mc-switch` (64 × 36 px: Now tab) | one `.switch` at DESIGN.md's 64 × 36 px (44 px on a phone), `aria-pressed` |
| Link as a button | `a.button` on `surface`, 40 px, 8 × 16 px | the button's own look: `raised`, 36 px, 7 × 14 px (44 px on a phone) |
| Fold chevron | `.sim-fold`, `.sim-inputs-head`, `summary.part-title` (8 px, right), `.rc-fold-sum`, `.hv-run-toggle` (6 px, left), and the browser's triangle on `.al-history`, `.tk-fold`, `.cal-routine`, `.sim-all-inputs`, `.sg-more` | one `.fold` summary (8 px drawn chevron at the right, 44 px on a phone); the row toggle keeps its 6 px chevron before its words |
| Data table | `.us-table` (the one), `.cp-targets`, `.yd-table` (head `muted`), `.rooms` (dead: the Rooms list is folded into the Overview) | `.us-table` renamed `.table`; `.cp-targets` and `.yd-table` keep their layout but take its head colour (`ink-2`) and cell padding; delete `.rooms` and its phone rules |
| Field box | `.field input/select`, `.ctl`, `.sim-crop-row select/input`, `.sim-choice input`, `.tk-every input` (36 px), `.tk-as select` (36 px), `.tk-dialog textarea` each restate the box | one `.input` rule set used by all; the in-a-line selects at 36 px by a modifier |
| Checkbox size | 16 (`.sim-choice` radios), 18 (`.sim-check`, `.cp-auto`), 20 on a phone in five separate rules | one rule: 18 px, 20 px on a phone |
| Compact button | `.ov-alarm button`, `.cp-room-note button`, `.cp-more`, `.cp-stage-actions button` each 32–36 px with their own padding | one `.compact` (32 px, 4 × 12 px, 13 px) |
| Quiet button | `.tk-quiet` and `.tk-aside` | `.quiet` (the aside adds `critical-text`) |
| Empty state | `.empty`, `.missing`, `.hv-empty`, `.now-bare` | one dashed card `.empty-card` (DESIGN.md Empty states) |

### The business modules

- [ ] Run the detector over the Batches (`.bt-`), Inventory (`.iv-`), Sales (`.sl-`) and Costs (`.co-`) blocks; every size from `--fs-*`, every corner from the radius steps, their tables, tiles, chips and empty states the shared ones above, their section card titles at Card title.

## Tasks

- [ ] **1. Re-audit.** `impeccable detect --json web/` and the greps in this file's tables at the merged v2; update the line numbers; screenshot Overview, Today, Settings, a room's Now, Tasks, Harvest, Setup and History, a simulation and Suggest at 360 and 1440 px in both themes (the "before").
- [ ] **2. Tokens.** Add `--radius-sm`, `--radius-track`, `--radius-segment`, `--radius-pill` to the `:root` block beside `--radius`; test: a `node --test` check that `web/styles.css` has no `border-radius` outside the tokens and the drawing exceptions, no `font-size` in `rem` or under 12 px outside `@media print`, no weight outside 400–700 outside the sheet's ✗ (`tests/design-scale.test.js`, failing first).
- [ ] **3. Type and corners** from the tables above until that test passes.
- [ ] **4. One part each:** segmented, chip, count, switch, link button, fold, table, field box, checkbox, compact and quiet buttons, empty state; JS class names changed with them; delete the dead CSS. `npm test` after each part.
- [ ] **5. Card titles** after the owner has seen the screenshots.
- [ ] **6. Business modules** onto the shared parts.
- [ ] **7. Check:** the detector clean but for the false positives above; screenshots "after" at the same sizes and themes beside the "before"; an Impeccable critique and audit of the pages that changed (desk and phone, both themes), fixes, then the finish review.

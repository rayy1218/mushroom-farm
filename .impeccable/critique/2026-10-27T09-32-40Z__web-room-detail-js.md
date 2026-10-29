---
target: room page (all 9 tabs)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/foqcus/Documents/mushroom-farm/web/room-detail.js"
target_fingerprint: "sha256:c5dfd76e169bea0e130592faf573d57f131f380a758e70e2ddd626024e097995"
target_path: /home/foqcus/Documents/mushroom-farm/web/room-detail.js
timestamp: 2026-10-27T09-32-40Z
slug: web-room-detail-js
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent, isolated, parallel)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Live mark, In band chips, command/reported/running good; Overview rounds RH ("93 ▲ Above band" on a 93 edge); no tab status |
| 2 | Match System / Real World | 3 | Air-path order + drawing excellent; jargon: "T/RH probe", "Relay output 4", "Ramp (h)" |
| 3 | User Control and Freedom | 2 | Auto button reads "On"; disabled manual switches, no route to take over |
| 4 | Consistency and Standards | 1 | Machine state drawn three ways; same value differs across tabs |
| 5 | Error Prevention | 2 | Confirms + crop-band warning good; crop targets vs Climate bands with no rule for which wins |
| 6 | Recognition Rather Than Recall | 2 | 9 tabs; CO2 700–800/1000 on Climate vs 700–900/1,500 on Crop; runs named by timestamp |
| 7 | Flexibility and Efficiency | 2 | Per-tab URLs; no room switcher, no tab badges |
| 8 | Aesthetic and Minimalist Design | 2 | Overview strong; other tabs flat form dumps; fresh-air line ×3 |
| 9 | Error Recovery | 2 | Retry banner; "Pick a range to see water" dead end; Room 2 "Not wired" with no next step |
| 10 | Help and Documentation | 3 | Typical crop values excellent; hidden thresholds (dehumidifier ≤ 90) |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict
LLM: Overview is unmistakably this product (room drawing, air path, machines in air order, crop strip); the other 8 tabs are generic admin scaffolding (nested grey bordered cards, flat bold labels, system-ui 12–15 px, white buttons, colour only on dots). One designed screen with eight default-form tabs behind it.
Deterministic: CLI static scan 1 advisory (JS-rendered markup invisible). Rendered DOM (CDP, 1440): Overview 13, Climate 5, Crop 4, Energy 4, Charts 0, Equipment 0 — nested-cards 21 (rt-tile/mt-tile real; c-group/cp-program/us-tile debatable; mimic-host false positive), tiny-text 2 (false positive, SVG labels ~15 px), low-contrast 1 ("✓ In band" 4.46:1), flat-type-hierarchy 1 (Equipment 390: steps 1.22), straggler 1, repeating-stripes 2 (false positive, legend swatches). Real a11y defect: label.crop-check for=crop-1-atonce before its input exists (web/crop-card.js:234–245 vs 534).

## Priority Issues
- [P1] Aesthetic stops at the first tab: nested cards, flat type scale, white input-like buttons, machine state drawn three ways, charts auto-scaled (room line flat; power rescales every poll). Fix: one card level, real type scale + tabular readings, series colours carried to Climate/charts, teal = running everywhere, one machine component, charts zoomed to band. Commands: typeset, colorize, polish (or redesign).
- [P1] Numbers contradict across tabs: humidifier "Below 87 %" vs kept on at 90.9; dehumidifier hidden 90; RH rounded; Crop vs Climate CO2; filter 40.2 vs 0 Pa; "1 day" vs "day 2 of 7". Fix: state real rules with hysteresis, RH one decimal, Crop marks overrides, one day-count rule. Command: clarify.
- [P1] Readings not first: tiles at y≈833 of 900 on desktop; crop strip ~300 px above on phone. Fix: readings first, drawing (desktop)/machines (phone) next, crop strip one line. Command: layout.
- [P2] 9 tabs; phone hides 5 off-edge; Room profile/Sensors/Energy overlap. Fix: ~5 tabs (Now, History, Crop, Simulations, Setup), status dots, edge fade. Commands: distill, adapt.
- [P2] Manual takeover on phone: machines at bottom of 3,300 px Climate; "Auto [On]" ambiguous; 4 identical status words; header truncates brand. Fix: Auto | Manual segmented + consequence line, one state per machine + mismatch-only warning, machines above bands, icon theme toggle. Commands: adapt, harden.

## Persona Red Flags
- Farm worker at the door: crop facts before temperature; "Below 87 %" mismatch looks like a fault; Filter changed / Start this stage prominent; Room 2 no guidance.
- Casey: hidden tabs; 3,300–3,600 px pages; "30 d" wraps; Energy Cost clipped; 12–13 px secondary text.
- Sam: Auto visible "On" vs name "Auto (automatic control)"; Overview On/Off not tied to machine names; merged h2; fixed px sizes; label/for defect.
- Alex: no room switcher, no tab badges, simulation rows lack settings.

## Minor Observations
Fresh-air line ×3; Equipment grid stretches Energy meter card; "Rest (mostly the aircon)"; water bars no metered/estimated; intake fan no arrow; Crop "Ramp (h)" no visible Save; light theme reads floor better.

## Questions to Consider
- Why does the door screen say what is growing before whether the room is OK?
- Which values run the room, crop stage or Climate?
- Does the drawing earn 450 px every visit?
- From three jobs (check, act, set up), would you design 9 tabs?

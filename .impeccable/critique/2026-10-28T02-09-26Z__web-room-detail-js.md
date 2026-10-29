---
target: room page (redesign branch)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/foqcus/Documents/mushroom-farm/web/room-detail.js"
target_fingerprint: "sha256:c5dfd76e169bea0e130592faf573d57f131f380a758e70e2ddd626024e097995"
target_path: /home/foqcus/Documents/mushroom-farm/web/room-detail.js
timestamp: 2026-10-28T02-09-26Z
slug: web-room-detail-js
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent, isolated, parallel). Target: the redesigned room page on branch feat/room-redesign (worktree .claude/worktrees/room-redesign, b2e089c), live test copy :8081.

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Live dot, chips, pills good; Manual mode quiet; traces hide where in band |
| 2 | Match System / Real World | 3 | Air-path order, plain words; "Lion's mane (draft)'s range", "kept on", "RH 88 ≤ 90" |
| 3 | User Control and Freedom | 2 | Manual one tap, no expiry or reminder; Start this stage beside the pencil |
| 4 | Consistency and Standards | 2 | Not wired vs No data; Intake vs Intake fan; Save models differ |
| 5 | Error Prevention | 2 | Crop shows targets the room isn't running; 30 px Auto/Manual on phone; filled red Delete |
| 6 | Recognition Rather Than Recall | 3 | Simulation runs named only by date |
| 7 | Flexibility and Efficiency | 2 | History opens on Live; no shortcuts; runs not comparable |
| 8 | Aesthetic and Minimalist Design | 3 | Now clean and ranked; Setup 6,633 px on a phone |
| 9 | Error Recovery | 2 | Unwired room: 8 "Not wired" chips, no single path |
| 10 | Help and Documentation | 3 | Inline hints excellent |
| **Total** | | **25/40** | **Acceptable** (was 22/40) |

## Design Specificity Verdict
LLM: content specific (drawing, air-order machines, plain domain hints), frame is the category standard (by the owner's choice); on a phone the drawing is an unlabelled thumbnail. Deterministic: CLI 3 (overused-font ×2 Inter by choice, stripes advisory = legend swatches); rendered DOM per tab 1–3, all false positives (Inter, scaled SVG labels 11.5 user units, legend hatch); no contrast, nesting or layout findings. Chrome issue: room switch select without name (fixed b2e089c).

## Priority Issues
- [P1] Crop leads with stage targets the room isn't running (700–900/1,500 bold vs 700–800/1,000 in the note). Fix: running value primary, stage value secondary, "Back to stage values". clarify.
- [P1] Manual mode quiet, permanent, hard to tap (30 px on phone; no marker beyond the segment; no expiry). Fix: ≥44 px, Manual chip on every tab with since-time, say what still runs, reminder or auto-return. harden.
- [P1] Traces lose band context (zoomed, hysteresis zig-zag, drifting "Last 48 min"; binary In band chip). Fix: fixed per-metric scale, band edges as lines, latest point, "Last hour", near-edge state. clarify.
- [P2] History opens on Live; outdoor flattens the room line; power axis not from zero; unlabelled gaps with bars through them; timeline far from its charts. clarify + harden.
- [P2] Setup one long form; filter in two cards; unwired room with no path; blocks drawn without a crop. distill + onboard.

## Persona Red Flags
- Worker at the door: no near-edge cue; can't tell if someone left Manual; failed sensor checks keep "✓ In band" on the chip (only alarms carry it).
- Casey: ~290 px of header before the first reading; Auto/Manual smallest target; drawing thumbnail.
- Sam: 30 px Auto/Manual, 20 px back link; energy table heading not a heading; Humidifier-during-exchange toggle looks like a button.
- Alex: History on Live; no shortcuts; simulations not comparable.

## Minor Observations
"kept on" wording inside band; Intake vs Intake fan in energy table; simulation row baseline and dead column; odd axis ends; grey-only timeline; Delete filled red at rest; "Air path: in, treated, out" wraps at 390.

## Questions to Consider
- If a worker taps Manual at 6 am and walks away, who finds out, and when?
- Is the drawing for the owner's pride or the worker's diagnosis?
- Why does Crop lead with numbers the room isn't running?
- Should History open on "what happened while I was away"?

---
target: Batches pages
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/foqcus/Documents/mushroom-farm/.claude/worktrees/batches/web/batches-page.js"
target_fingerprint: "sha256:403f0ac674120acdda18f35d62602cbc488a0af0bb3611db2ea7b6b01d1e4ffc"
target_path: /home/foqcus/Documents/mushroom-farm/.claude/worktrees/batches/web/batches-page.js
timestamp: 2026-11-05T05-00-34Z
slug: web-batches-page-js
---
Method: dual-agent (A design review · B detector/browser) + technical audit. Design health 23/40; audit 16/20.
Heuristics: 1:2 2:3 3:3 4:2 5:2 6:2 7:2 8:3 9:2 10:2.
Priority: [P1] batch page hides good blocks, same title for every batch of a crop; [P1] Record a check buried, 19 px row links, no action on in-room rows; [P2] Receive dialog groups don't read, 13-box column; [P2] Put/Delete don't show consequences, Delete in head unlike Harvest; [P2] a11y/consistency: sheet overflow at 390, amber 4.32:1 light, Put aria-label drops visible words, sheet table no caption/row th, card titles 16/14 px, blue links, raw date inputs, mixed button heights.
Minor: year shown on this year's dates; Past "0" lost; loading text; count alignment; Time inputmode; faint underline.

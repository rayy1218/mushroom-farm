# Plan: safety and history (v2 iteration 6)

Spec: `docs/superpowers/specs/2026-10-19-safety-and-history-design.md`. Base: `b73003f` (schema upgrade 6 → 7 done: tables `alarms`, `machine_log`, index `readings_by_time`, five `room_controls` columns; deletes with the room). TDD: a failing test first for each item, `npm test` green before every commit.

## Streams (parallel, one worktree each)

| Stream | Owns (new files) | Edits (shared files: add, don't rewrite) | Spec sections | Done when |
|---|---|---|---|---|
| **A Safety** | `server/checks.js`, `server/alarms.js`, `web/alarms.js` (+ `web/alarms-math.js` if useful), tests `checks`, `alarms`, `controller-safety`, `api-alarms`, `e2e-safety`, `web-alarms` | `server/controller.js`, `server/db.js` (control columns in getControl/setControl/setControlState; alarm queries), `server/api.js` (alarm routes, control fields), `server/main.js`, `web/control.js`, `web/room-detail.js` (alarms card only), `web/rooms-list.js` (alarm chip), `web/styles.css` | 1, 2, 3, 5 (alarms, control) , 6 (room alarms card, control card, rooms list), 7 | all spec rows of those sections built and tested |
| **B History** | `server/history.js` (queries may live in db.js instead), `web/overview.js`, `web/history.js` (range choice, long charts, timeline), `web/timeline.js` / `web/history-math.js` as useful, tests `machine-log`, `api-history`, `api-overview`, `web-history`, `web-overview` | `server/machines.js` (log writes), `server/db.js` (log insert, history and overview queries), `server/api.js` (`/history`, `/overview`), `web/room-detail.js` (charts area only), `web/app.js`, `web/route.js`, `web/index.html` (Overview entry + badge), `web/chart.js` (if a range needs it), `web/styles.css` | 4, 5 (history, overview), 6 (Overview page, charts, timeline, nav badge) | all spec rows of those sections built and tested |

B reads the `alarms` table directly for the overview counts and calls `GET /api/alarms` (built by A) from the web; its web tests stub fetch. A and B both edit `db.js`, `api.js`, `room-detail.js` and `styles.css`: keep additions in their own blocks so the lead can merge.

## Lead

1. Merge A then B into `v2`, resolve the shared files, `npm test`.
2. Opus review per stream (server + web), Sonnet fix round.
3. README (automatic control is built; safety, alarms, history, Overview), backup `data/v2.db` → `data/v2-before-safety.db`, real-app check with the device app, memory note.

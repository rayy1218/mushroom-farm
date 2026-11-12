# Alarms triage Implementation Plan

**Goal:** Alarms that triage for the farmer: a hot, cold or dry room climbs to Serious and Critical and reaches the phone; one gateway outage is one alarm and one message; cleared alarms fold away and age out; the room page's alarms take one line off Now and span the page on Now; workers see the bands and acknowledge.

**Architecture:** Spec `docs/specs/2026-11-12-alarms-triage-design.md`. Database 27 adds `alarms.acked_by` (task 14). The crop limits are pure data in `web/crops.js`. `server/alarms.js` escalates the alarm that is on through a new `db.escalateAlarm`, folds a dead relay module into one alarm and gets `evaluateGateways(health)` for the gateway alarm; the poller hands each gateway's health to the controller after the cycle. `server/telegram.js` handles the `escalated` change. The current-alarm queries take a review window; `server/api.js` adds the held lists, a room's shared gateway alarm and a batch acknowledge. The web side gets pure helpers in `web/alarms-math.js` (split, group, strip text) and the cards use them.

**Tech Stack:** Node 22.13+, `node:sqlite`, plain JS modules, no build, `node --test`.

---

## Ground rules

| Rule | Detail |
|---|---|
| Branch | `feat/alarms-triage` in `.claude/worktrees/alarms`; every command there |
| Tests | One file: `node --disable-warning=ExperimentalWarning --test tests/<file>`; all: `npm test` (3074 at the start) |
| Commits | One per task, "Alarms triage: …", no trailers |
| Live farm | Never touched. The UI check runs on a copy of the audit database on port 8181 with its own sims (task 13) |

## File map

| File | Change |
|---|---|
| `web/crops.js` | `limits` per crop; `roomLimits(crops, bands)` |
| `server/db.js` | `escalateAlarm`; `currentAlarms(roomId, now)` with the 12 h window; overview alarms uncapped (200) and windowed; `ackAlarms(ids, at)` |
| `server/alarms.js` | Tiers for `tHigh`, `tLow`, `rhLow`; `relayNoAnswer`; held keys; `evaluateGateways`; `heldList` |
| `server/poller.js` | Per-gateway health, passed to `afterCycle` |
| `server/controller.js` | `run(cycleStart, gateways)`: the gateway alarms first, then each room with its crop limits, stage and held flag |
| `server/telegram.js` | `escalated` |
| `server/api.js` | Held lists; the shared gateway alarm on a room; `POST /api/alarms/ack`; the ack log line |
| `server/roles.js` | The worker routes of spec 8 |
| `web/alarms-math.js` | `splitAlarms`, `causeGroups`, `stripText`, `REVIEW_MS` |
| `web/alarms.js` | The card: active, the fold with groups, a group's Acknowledge; `createAlarmStrip` |
| `web/room-detail.js`, `web/styles.css` | The strip off Now; the card full width on Now; a worker's bands |
| `web/overview.js`, `web/overview-data.js` | Active then the fold; no cap of 10 |
| `README.md` | The alarms paragraph and the routes |

## Tasks

### Task 1: crop limits
- [ ] Test (`tests/crops.test.js`): every crop has `limits { hot, cold, dry }`; `roomLimits([{crop:'oyster'}], bands)` gives 32/15/70; a mix takes the strictest; the band guard (tHigh + 3, tLow − 3, rhLow − 10); no crops → null.
- [ ] Implement in `web/crops.js`. Run, commit.

### Task 2: database queries
- [ ] Test (`tests/db-alarms.test.js`): `escalateAlarm(id, level, text, at)` changes level and text, clears `acked_at`, tells `escalated`, does nothing to a cleared alarm; `currentAlarms(null, now)` drops cleared-unacked older than 12 h, keeps active ones of any age; active first; `ackAlarms([ids], at)` counts the newly acknowledged and tells `acked` for each; the overview list holds more than 10.
- [ ] Implement. Run, commit.

### Task 3: tiers
- [ ] Test (`tests/alarms-tiers.test.js`): tHigh Warning at 5 min, Serious at 30 min, Critical past the hot limit for 10 min (straight from nothing too); up only; tLow cold 30 min; rhLow dry only in fruiting/pinning; no crops no Critical; a reading back inside the limit restarts the count; texts as the spec.
- [ ] Implement `limits` and `stage` inputs in `alarms.evaluate`; the controller passes `roomLimits(program.crops, c)` and `program.stage`. Run, commit.

### Task 4: Telegram on escalation
- [ ] Test (`tests/telegram.test.js`): an escalation to a chosen level sends one message; to Critical it repeats; a warning escalated to serious with only critical chosen sends nothing.
- [ ] Implement. Run, commit.

### Task 5: one relay module alarm
- [ ] Test (`tests/alarms.test.js`): every relay output `no-answer` → one `relayNoAnswer` after 1 min, no `machine.*`; the aircon keeps `machine.ac`; it clears on an answer.
- [ ] Implement; update the older no-answer cases. Run, commit.

### Task 6: gateway health from the poller
- [ ] Test (`tests/poller-gateways.test.js`): a gateway whose every read fails with `no connection`/`timeout` is `down`; one with an exception or one good read is not; `afterCycle` gets `(cycleStart, gateways)` with the room ids.
- [ ] Implement. Run, commit.

### Task 7: the gateway alarm and the hold
- [ ] Test (`tests/alarms-gateway.test.js`): down 1 min → one `gateway` alarm on the lowest room, text with the rooms and counts; while down (even before 1 min) no sensor, relay or machine alarm is raised in the rooms behind it; up → cleared; the controller wires it (`tests/controller-gateway.test.js`).
- [ ] Implement `evaluateGateways`, `heldList`, the `held` input of `evaluate`, `controller.run(cycleStart, gateways)`. Run, commit.

### Task 8: routes
- [ ] Test (`tests/api-alarms.test.js`, `tests/api-login.test.js`): `held` on a gateway and relay alarm; a shared gateway alarm in another room's `current`; `POST /api/alarms/ack`; a worker may ack and GET control and still gets 403 on PUT control and machine commands; the log line names the worker.
- [ ] Implement. Run, commit.

### Task 9: web helpers
- [ ] Test (`tests/web-alarms-math.test.js`): `splitAlarms`, `causeGroups` (machine fault, sensor fault, repeats, lone), `stripText` (every combination, empty → null), the strip tone.
- [ ] Implement. Run, commit.

### Task 10: the room page
- [ ] The Alarms card: active list, the fold ("N cleared to review" + Review/Hide), group rows with one Acknowledge, neutral styling; Acknowledge buttons for workers.
- [ ] The strip off Now (a link to Now that focuses the card); the card a full-width row on Now above `.now-main` at desktop, under the readings on a phone.
- [ ] A worker's page reads the control GET for the bands (no Automatic control card). Run the web tests, commit.

### Task 11: the Overview
- [ ] Active alarms (all), then the fold with groups; worker Acknowledge; `overview-data.js` without the cap. Test `tests/web-overview-*.test.js` for the data helper. Commit.

### Task 12: docs
- [ ] README: alarms paragraph (tiers, limits, gateway, fold, workers), phone alarms (escalation), routes. Commit.

### Task 13: UI check
- [ ] Copy the audit database and sims to `/home/foqcus/.claude/task-logs/next/alarms-env/`, point its rooms at Modbus 2512–2514 and the farm at 2502, start the sims (HTTP 8191–8194) and the farm on 8181.
- [ ] Capture the Overview, a room's Now and another tab at 1440 and 390, dark and light, with an outage (one sim stopped) and with cleared alarms; Impeccable critique and audit; fix; commit the fixes and the captures' notes.
- [ ] Stop everything started (by PID).

### Task 14: database 27, who acknowledged (the lead's call, 2026-11-12)
- [ ] Test (`tests/db-alarms-acked-by.test.js`): the first name stays; a group and a room take one; a tier change clears it; 26 → 27 on a made file and on a copy of the audit's real v26 file (skipped without it); version asserts to 27.
- [ ] Implement the column, the step, the routes' names and "Acknowledged by …" on the pages. Commit.

### Task 15: the critique's six fixes and the audit's P1
- [ ] Focus after Acknowledge never on a live alarm's button (`focusAfterAck`, tested with stubs); Acknowledge all on the active ones only; the quiet card's heading and toggle; the strip on one line; the Overview card's tone and columns; outage texts with the place and a next step; five groups and Show all on a phone; a tier change announced.
- [ ] Look again at 1440 and 390, both themes; commit.

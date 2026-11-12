# Farm settings: reading interval (v2)

Date: 2026-10-19 · Branch `v2`. Owner: "I want the reading interval configurable — in app".

| Item | Decision |
|---|---|
| Setting | `pollSeconds`: how often the farm app reads every sensor and machine (the poll cycle). Whole number 1–300, default 5. Farm-wide. |
| Storage | table `settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`; db upgrade 4 → 5 creates it (no rows = defaults) |
| Applies | from the next poll cycle, without a restart; the cycle running now finishes first |
| API | `GET /api/settings` → `{ "pollSeconds": 5 }`; `PUT /api/settings` with `{ "pollSeconds": n }` → same shape; 400 `{ error: "Reading interval must be a whole number from 1 to 300 seconds", field: "pollSeconds" }`; JSON content type required (415) like other bodies |
| Page | sidebar gets a second entry **Settings** (gear icon) → `#/settings`: "Reading interval (seconds)" number input, Save, "Unsent changes"/Reset like the other forms, a one-line hint of the effects (graphs show the last 50 readings; "offline" = 3 failed readings in a row) |
| Phone layout | with two sections the bottom tab bar from the previous app returns below 900 px (Rooms, Settings) |
| Room page refresh | the room page refreshes every `pollSeconds`, clamped to 2–30 s (it reads `/api/settings` with the room) |
| Unchanged | the 10 s "switching" window, 3-polls-for-offline, 50 readings per graph, the device app |

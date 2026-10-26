# Live updates, phone alarms and outdoor air (iteration 12)

Date: 2026-10-26 · Branch `v2` · Builds on iterations 6 (alarms), 7 (outdoor sensor), 9 (dehumidifier) and 10 (fresh-air settings).

The owner asked (2026-10-26) for three parts at once: live updates pushed to the page (SSE), alarms to the phone, and the outdoor air used in automatic control. The lead chose every default (*default*).

## 1. Scope

| In | Out (later) |
|---|---|
| Server-sent events: the pages refresh when something changes, with the timers as a fallback | WebSockets; pushing whole data on the stream (the page still asks for it) |
| Telegram alarm messages: raise, clear, repeat while unacknowledged; a test button | Acknowledging from Telegram; SMS or WhatsApp; several chats per level |
| Outdoor air in control: free cooling, outdoor drying, fresh air that waits out very wet outdoor air; in the controller and the simulation | Using the outdoor air to decide the aircon setpoint |

## 2. Events (`server/events.js`, prep — built)

| Item | Rule |
|---|---|
| Bus | `createEvents({ log })` → `publish(type, data)`, `subscribe(fn(type, data))` → unsubscribe, `listeners()`; a throwing listener is logged, the others still run |
| Alarm hooks (prep — built) | `db.onAlarmChange(fn)`: `fn({ change: 'raised' \| 'cleared' \| 'acked', alarm })` and `fn({ change: 'acked-room', roomId })` after the change; a throwing listener is logged |
| Types published (SSE stream builds them) | `room` `{ id, part }` with `part` one of `readings` (after a poll cycle, every room polled), `machines` (after a command or a machine status change), `control` (control settings saved, or the controller changed what it commands), `crop` (crop or stage saved or changed by the program), `filter` (a filter change); `alarms` `{ count }` (active alarms of the farm, after any alarm change); `outdoor` `{}` (after the outdoor probe was polled); `simulation` `{ id, roomId, status, progress }` and `sizing` `{ id, roomId, status, progress, tried, total }` (a job's progress or end) |

## 3. Live updates (SSE)

| Item | Rule |
|---|---|
| Route | `GET /api/events` → `200 text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`; first `event: hello` with `data: {"at": ms}`; each bus event as `event: <type>` and `data: <json>`; a comment line `: ping` every 25 s *default* |
| Clients | at most 20 *default* open streams (the 21st gets 503 `{ "error": "Too many live connections" }`); a closed request unsubscribes at once |
| Pages | one shared `web/live.js`: a single `EventSource('/api/events')` for the whole app, `on(type, fn)` → off, `connected()`; the browser reconnects by itself |
| What refreshes | the room page on `room` of its id (any part; 300 ms debounce *default*), the Overview on `room`, `alarms` and `outdoor`, the nav alarm badge on `alarms` (use its `count`), the simulation results page and the stepper on `simulation` / `sizing` of their id (instead of polling every 1–2 s; one GET at the end for the result) |
| Fallback | while connected the pages' own timers slow to 60 s *default*; disconnected, they run as now |
| Mark | a small "Live" dot in the top bar while connected, "Not live" (muted) when not *default* |

## 4. Outdoor air in control

| Item | Rule |
|---|---|
| Setting | room control `outdoorAir` (prep — stored, default true for new and existing rooms, `PUT .../control` boolean, field `outdoorAir`); label "Use outdoor air (free cooling, drying, wait out wet air)"; it does nothing without an outdoor probe |
| Input | the farm's outdoor probe (iteration 7) as `readings.outdoor = { t, rh }` passed to `decide`, only its last good reading of the last 5 min *default*, else null |
| Moisture | absolute humidity W (g/m³) of the room and outdoors from T and RH (the model's `wOf`) |
| Free cooling | the exchange starts when outdoor T ≤ room T − 2 °C, the room is above the middle of its band + 0.25 × band width, outdoor W ≤ room W + 0.5, and CO₂ is below the safety level; it stops when room T ≤ the middle, or outdoor T > room T − 1, or outdoor W > room W + 1 (`exchangeKind 'cooling'`); reasons "Free cooling: outdoor 22.4 °C, the room 25.1 °C" / "Free cooling ends: the room is at 24.5 °C" |
| Outdoor drying | the exchange starts when room RH ≥ rhHigh, outdoor W ≤ room W − 1, outdoor T ≤ room T + 4 °C; it stops when RH ≤ the middle of the RH band, or outdoor W > room W − 0.5, or outdoor T > room T + 5 (`exchangeKind 'drying'`); reasons "Outdoor drying: outdoor air 12.1 g/m³, the room 15.4 g/m³" |
| Drying and temperature (added after the measurements) | with outdoor air cooler than the room, drying starts only with the room above tLow + 0.25 × band width and ends at tLow; with warmer outdoor air only below tHigh − 0.25 × width, ending at tHigh (reasons "Outdoor drying ends: the cooler outdoor air took the room to 21 °C"); milky room 17 days: all three in band 48.3 % off → 57.3 % on, energy +0.8 % (without this guard +7 % and the temperature in band 5 points lower) |
| Free cooling and the aircon drop | the aircon drop (`acDrop`) is not applied during free cooling |
| Wet outdoor air | a fresh-air run (iteration 10, not the CO₂ rule) waits while outdoor W ≥ room W + 3 or outdoor T ≥ room T + 8, for at most one more interval (so at most 2 × `exchangeEveryMin` without fresh air); reason "Fresh air waits: outdoor air is very wet (dew 25.3 °C), at the latest 16:40" |
| Order | the CO₂ safety level, a CO₂ sensor fault, the CO₂ rule, then free cooling and drying, then fresh air; free cooling and drying obey the exchange's minimum on and off times and its time limit (`exchangeMaxMin`), and count as an exchange for the fresh-air wait |
| State | `exchangeKind` (prep — stored): 'co2', 'fresh', 'cooling', 'drying', 'timed' (sensor fault), null when off; a free cooling or drying exchange that the CO₂ rule takes over (CO₂ at the upper limit) keeps its kind, and its time limit is not counted as "too small" |
| Humidifier, dehumidifier, aircon | the humidifier forced on during an exchange (`humidifierDuringExchange`) applies to the CO₂, fresh-air and timed exchanges only; free cooling and outdoor drying leave the humidifier on its normal rule and do not count as a humidifier run for the dehumidifier's 30 min wait; the aircon drop applies to drying, not to free cooling |
| Simulation | `simulate` passes the outdoor air of each step (`outdoorAt`) as `readings.outdoor`, and the room's `outdoorAir` through `ctx.control` (a run's `control` may set `outdoorAir`); Suggest machines searches with the room's setting |
| Page | the control card: the setting (with the room's other control settings), the exchange line names the kind ("Air exchange on since 10:42 · free cooling"), the reasons as now; the control view has `outdoorSet` (an outdoor sensor is set), the note "needs an outdoor sensor (Settings)" shows when it is false |

## 5. Phone alarms (Telegram)

| Item | Rule |
|---|---|
| Settings (farm-wide, the settings table) | `telegramToken` (the bot's token from @BotFather; write-only: GET shows `telegramTokenSet: true` and `telegramTokenEnd` (its last 4 characters), never the token), `telegramChatId` (text: a number, a negative group id or `@channel`), `telegramLevels` (any of `critical`, `serious`, `warning`; default `["critical","serious"]`), `telegramCleared` (send a message when an alarm clears, default true), `telegramRepeatMin` (repeat an active, unacknowledged critical alarm every N min, 0 off; default 30, whole 0–1440) |
| When | on `raised` of a level in `telegramLevels`; on `cleared` of one that was sent (when `telegramCleared`); a repeat of an active, unacknowledged critical alarm every `telegramRepeatMin` |
| Text | "🔴 Critical · Room 1 · CO₂ 1400 ppm, at or above the safety level 1250 · 26 Oct 16:20"; serious 🟠, warning 🟡; cleared "✅ Cleared after 12 min · Room 1 · …"; repeat "🔁 Still on for 35 min, not acknowledged · Room 1 · …" |
| Sending | `POST https://api.telegram.org/bot<token>/sendMessage` with `{ chat_id, text }`; the transport injectable (tests never reach the internet); one message at a time; a failure is retried after 1, 5 and 15 min, then dropped; at most 50 waiting (the oldest dropped first); never blocks or breaks the control loop; the token never in a log line or an error text sent to the page |
| Restart | at start, with a token and chat id set, the active alarms of the chosen levels count as sent: no raised message again, the cleared message still goes, and an unacknowledged critical one repeats counted from its raised time (at once when that is overdue). A repeat first checks the alarm is still active and unacknowledged. Saving the settings moves the repeats: 0 cancels, a new interval counts from the last message, 0 → on starts them |
| Retries | a 429 waits at least Telegram's `retry_after` before the next try |
| Test | `POST /api/settings/telegram/test` → 200 `{ ok: true }` or 502 `{ error: "Telegram said: chat not found" }` (Telegram's description) or 400 `{ error, field }` when the token or chat id is missing |
| Status | GET settings adds `telegramLastSentAt` and `telegramLastError` (in memory) |
| Page | Settings: a "Phone alarms (Telegram)" card with the steps in a few lines (make a bot with @BotFather, send it a message, find the chat id), the fields, Send test message, the last sent / last error |

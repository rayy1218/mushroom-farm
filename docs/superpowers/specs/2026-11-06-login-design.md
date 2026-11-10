# Login: who is using the farm app, and what they may see

Date: 2026-11-06, to what ships 2026-11-10 · Branch `feat/login` from `v2` at `917219b` · Database version 25 · Live with Funnel on

The owner chose (2026-11-06) every row marked *owner*: personal sign-in for everyone; two roles, owner and worker; a worker
does floor work and sees no money; workers sign in with their name and a 6-digit PIN, owners with a password; the person
signed in is the one recorded on Done, Skip, harvests and uses; the farm app reached from the internet through Tailscale
Funnel once the login is in, the device apps staying on the tailnet; sessions kept in the database (approach 1 of 3:
not a signed cookie, not Tailscale's identity headers, which Funnel visitors do not have).

## 1. Scope

| In | Out (later) |
|---|---|
| Sign-in with a name and a PIN (worker) or a password (owner) *owner* | Google or other outside sign-in |
| Two roles: owner (everything) and worker (floor work, no money) *owner* | More roles (a manager), per-room access |
| Sessions in the database; sign out; sign out everywhere | Remember-this-device lists, push sign-out to open pages |
| The person signed in recorded on Done, Skip, harvests, uses, counts *owner* | Rewriting the names on past records |
| The server refusing what a worker may not do (403), not only the menu | Hiding the page code itself (it is public on GitHub) |
| Lockout after wrong tries, per account and address, a worker's daily cap, and a budget for the internet | Captcha, two-factor |
| The first owner set from the VM's command line | A first-run page on the web |
| Tailscale Funnel for the farm app *owner*; README and `deploy/oracle/` | Opening a port on the VM, a domain of our own |

## 2. Data (database version 25)

`workers` gains four columns and a new STRICT table `sessions` is made, in `server/db.js`'s own block
(`// ---- Login ----`) by the step `if (version < 25) { … }`; `VERSION = 25`.

| Column (`workers`) | Type | Rule |
|---|---|---|
| `role` | TEXT NOT NULL DEFAULT `'worker'` | `'owner'` or `'worker'` (CHECK). Every worker of version 24 becomes `'worker'`. |
| `secret_hash` | TEXT | Null: cannot sign in. Else `scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>` (N 2^15, r 8, p 1, a 16-byte salt, a 32-byte hash). A worker's secret is their PIN, an owner's their password. |
| `failed_tries` | INTEGER NOT NULL DEFAULT 0 | Wrong tries since the last right one or the last lock |
| `locked_until` | INTEGER | Unix ms; null when not locked |

| Column (`sessions`) | Type | Rule |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | |
| `token_hash` | TEXT NOT NULL UNIQUE | SHA-256 (hex) of the cookie's token; the token itself is never stored |
| `worker_id` | INTEGER NOT NULL | REFERENCES `workers(id)` ON DELETE CASCADE |
| `created_at` | INTEGER NOT NULL | Unix ms |
| `last_seen` | INTEGER NOT NULL | Unix ms; written at most once an hour per session |
| `expires_at` | INTEGER NOT NULL | Unix ms: `last_seen` + 30 days (worker) or + 7 days (owner); sliding |
| `user_agent` | TEXT | Up to 200 characters, for Settings → Workers' "signed in on" |

A worker's sessions are deleted when their secret or role changes, when they are made inactive or removed, and by
**Sign out everywhere**. Expired sessions are deleted at start and hourly.

## 3. Signing in

| Item | Rule |
|---|---|
| Cookie | `farm_session=<token>`: 32 random bytes, base64url; `HttpOnly; Secure; SameSite=Strict; Path=/`; `Max-Age` the session's length, sent again when `expires_at` moves |
| Names | `GET /api/login/names` (no session needed) → `[{ id, name, kind: 'pin' \| 'password' }]`, the active workers with a secret, in the Workers order |
| Sign in | `POST /api/login` `{ id, secret }`. Right: 200 `{ id, name, role }` with the cookie. Wrong, unknown id or no secret: 401 "That PIN is not right" / "That password is not right" (the same time taken: an unknown id hashes against a fixed dummy). Locked: 429 "Too many tries. Try again at 14:35" |
| PIN | Exactly 6 digits when a PIN is set (400 otherwise, field `secret`). Refused as too common (400 "Pick a PIN that is harder to guess"): one digit; a pair or a triple repeated (121212, 123123); doubled or tripled digits (112233, 111222); a run up or down (234567, 987654); two keypad lines (147258); a date (DDMMYY, YYMMDD, MMDDYY). Signing in with a PIN of any shape is only "That PIN is not right" (401) |
| Password | 14 to 200 characters when set (an owner signs in from anywhere), with at least 6 different characters; refused (400 "Pick a password that is harder to guess …") when it holds the person's name or a word of it of 3 letters or more, a farm or common word (mushroom, farm, password, qwerty, letmein, 123456, abcdef), or is one word with a year and symbols. Checked where a password is set (Settings → Workers, Your password, `npm run owner`); one set before is not checked again |
| Lockout, account and address | 5 wrong tries in a row at one name from one address lock that name for that address only, 15 minutes (a stranger cannot lock the owner or a worker out of their own phone); the lock and the count are in memory. The owner is told by Telegram (at most one note an hour per name) and sees nothing to unlock: it ends by itself |
| Lockout, a worker's day | 20 wrong tries in 24 hours from any addresses lock a worker until the owner's Unlock (stored in `locked_until` as the last time a date holds); a Telegram note at the 10th wrong try (a warning) and at the lock; Settings → Workers reads "Locked until the owner unlocks". A right try settling first takes the count away; a try in flight across an Unlock answers as wrong. A new PIN or role starts the counts again. An owner has no daily lock (a stranger could otherwise lock the owner out; the 14-character password stands in) |
| Lockout, address | 20 tries in 15 minutes from one address get 429 for the rest of the window (in memory; a full map drops its oldest address, never refusing a new one). The address is `X-Forwarded-For`'s last entry (the one Tailscale's proxy adds) when the request comes from 127.0.0.1 (Tailscale's proxy), else the socket's; IPv6 counts by its /64, except a tailnet device (`fd7a:115c:a1e0::/48`), which counts on its own |
| The internet's budget | A try from the internet (not from the tailnet or this machine; a request with Tailscale's Funnel mark is always the internet) counts against 600 checked tries in 15 minutes at all names together; spent, a try answers 429 that the app is getting too many sign-ins, for the rest of the window. At most 16 sign-in checks (scrypt, 32 MiB each) run at once, 12 of them the internet's, so the tailnet always has room; over that, 503 "busy" |
| Log | Every try to the app's log: time, address, worker id, right / wrong / locked; never the secret. A refused try logs one line a minute per kind, then how many more |
| Cookie `Secure` | Only when the request comes through Tailscale's https proxy (from 127.0.0.1); on plain http straight to the tailnet IP the cookie goes without `Secure`, so signing in works there too (that traffic rides Tailscale's encrypted tunnel and the port is not open to the internet) |
| Who am I | `GET /api/session` → `{ id, name, role }` or 401 |
| Sign out | `POST /api/logout` → deletes this session, clears the cookie, 204 |
| Own password | `POST /api/session/password` `{ current, next }` (owner) → right `current` needed; other sessions of the owner deleted |

## 4. The gate and the roles

`server/app.js` reads the session before routing. No session: `/api/*` answers 401 `{ error: 'Sign in' }` and
`/api/events` 401, apart from `GET /api/login/names`, `POST /api/login`; the page files (`web/`) are served to everyone, as
they hold no farm data. With a session, the request carries `{ id, name, role }` to the routes.

An owner may use every route. A worker may use only the routes of the allow-list in `server/roles.js` (method and path
pattern); anything else answers 403 `{ error: 'Ask the owner' }`. A route added later is closed to workers until it is added
to the list.

| Worker may | Routes |
|---|---|
| Sign out, see who they are | `POST /api/logout`, `GET /api/session` |
| See the farm | `GET /api/overview`†, `/api/rooms`, `/api/rooms/:id`, `/api/rooms/:id/sensors`, `/api/rooms/:id/history`, `/api/rooms/:id/crop`, `/api/rooms/:id/machines`, `/api/alarms`, `/api/outdoor`, `/api/outdoor/history`, `/api/settings`†, `/api/events` |
| Tasks | `GET /api/tasks/today`, `/api/calendar`, `/api/rooms/:id/tasks`, `/api/rooms/:id/tasks/log`, `/api/workers`† (names only); `POST /api/tasks/:id/done`, `/api/tasks/:id/skip`, `/api/tasks/:id/undo` (their own Done or Skip only) |
| Harvest | `GET /api/rooms/:id/harvests`†, `GET /api/harvest`†; `POST /api/rooms/:id/harvests` |
| Inventory | `GET /api/inventory`†, `/api/inventory/items/:id`†; `POST /api/inventory/uses`, `POST /api/inventory/counts` |

† Answered through the route's worker view in `server/roles.js`, which leaves the money out (RM, cost, price, value, profit,
the expected value and energy cost per kg, unit costs and purchase totals) and, for `/api/settings`, everything but what the
pages show a worker (no Telegram token or chat, no prices, no gateways). `server/roles.js` also holds `MONEY_KEYS`, the key
names that mean money, for the test in section 7.

Not for workers: Business (Batches, Inventory's purchases and edits, Sales, Costs, Runs, Summary), Settings, a room's Setup,
Control, Simulate and Simulations, usage (`/api/usage`, `/api/rooms/:id/usage`), CSV and myGAP sheets, task cancel, Plan
this, task rules, workers' edits.

Who is recorded: for a worker, Done, Skip, a harvest, a use and a count take the session's name; a `worker` in the body is
ignored. An owner may still name another worker from the list (a harvest recorded for someone), and their own name by
default.

Cross-site writes: the cookie is `SameSite=Strict`, every write needs `Content-Type: application/json` (415 otherwise), and a write whose `Sec-Fetch-Site` says another site, port or subdomain is refused (403); a request without the header (a script, curl) is judged by the cookie as before. Only the app's own pages write.

Live stream: `/api/events` follows the session. It ends within a ping (25 s) after its session ends, and takes at most 3 streams per sign-in, 6 per person and 20 in all, with 4 places kept for owners.

Headers: every reply carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`; API replies are `Cache-Control: no-store`. Page files are served gzipped (not the font) with an ETag, a reload being a 304.

## 5. Owner's tools

| Item | Rule |
|---|---|
| First owner | `npm run owner -- "<name>"` (`server/owner.js`) on the VM as the `farm` user, with the app's `FARM_DB`: finds or adds the worker of that name, makes them owner, asks for the password twice without echo, deletes their sessions. It is also how a lost owner password is reset. |
| Settings → Workers | Each row: role (Owner / Worker), **Set PIN** or **Set password**, Locked until … with **Unlock**, Signed in on N devices with **Sign out everywhere**. `POST /api/workers/:id/secret` `{ secret }`, `PUT /api/workers/:id/role` `{ role }` (not the last owner: 400 "The farm needs an owner"), `POST /api/workers/:id/unlock`, `POST /api/workers/:id/sign-out` |
| Top bar | The name and **Sign out** only; an owner's own password is the Your password card, first on Settings |

## 6. The pages

| Item | Rule |
|---|---|
| Start | `web/app.js` asks `GET /api/session` first; 401 shows the sign-in view, else the pages for the role |
| Sign-in view | `web/login.js` (and `web/login-math.js`): the names as buttons (44 px), then one PIN box (`inputmode="numeric"`, `autocomplete="off"`, 6 digits) or a password box (`autocomplete="current-password"`); the error under the box, said once (aria-live); light and dark themes, phone and desk |
| 401 later | `web/api.js`: any 401 (a session expired or signed out elsewhere) shows the sign-in view and returns to the same `#/…` after |
| 403 | "Ask the owner" in the page's error place |
| Worker menu | Today, Calendar, Overview, Rooms, Harvest, Inventory (Record use, Count stock). Hidden: Business, Settings, a room's Setup, Control, Simulations, Usage; money figures are not drawn when the reply leaves them out |
| Doing the rounds as | Gone: the picker and its kept name; Done is one tap for tasks with no amount |
| Couldn't load | The page's "Couldn't load" warning (8 s) stands down once `boot.js` runs; boot shows a real failure, or after 90 s (through Funnel the first files can be slow) |

## 7. Testing (TDD, `node:test`)

| Test | What it shows |
|---|---|
| Gate | Every `/api` route without a session → 401, apart from the two sign-in routes |
| Allow-list walk | A table of every route the API answers (method and a sample path); for a worker each one not on the list → 403, each on it → not 403. A new route missing from the table fails the test. |
| No money for workers | With a farm seeded with costs, sales, purchases and harvests, every allowed worker GET's reply scanned all the way down for a key in `MONEY_KEYS` → none |
| Sign-in | Right PIN, wrong PIN, unknown id, no secret, locked (5 tries, 15 minutes, unlock), the address limit, the same 401 text and shape for unknown and wrong |
| Cookie | The flags; the token not in the database; expiry slides; sign out; sign out everywhere; a secret, role or active change ends the sessions |
| Who is recorded | A worker's Done with another name in the body records the worker; an owner's records the name given |
| Owner tools | The last owner cannot be made a worker; `server/owner.js` sets a hash that signs in |
| Migration | A version-24 database moves to 25: workers keep names and become workers with no secret; tables and CHECKs as above |
| Pages | Sign-in view, 401 return to the page, worker menu: the `*-math.js` parts in unit tests, the view checked in the browser (phone and desk, both themes) |

## 8. Going live

Done: the code and database 25 went to the VM on 2026-11-06 and the post-Funnel hardening (section 9) on 2026-11-10; Funnel is on.

| Step | What | State |
|---|---|---|
| 1 | Copy `data/v2.db` (to `data/v2-before-login.db`), deploy with `deploy/oracle/push-code.sh oracle-farm`, then `sudo systemctl restart mushroom-farm`; the app moves the database to 25. From now on nobody is signed in | Done 2026-11-06 |
| 2 | `ssh oracle-farm`, `cd /opt/mushroom-farm && sudo -u farm FARM_DB=/opt/mushroom-farm/data/v2.db node --disable-warning=ExperimentalWarning server/owner.js "<name>"` (or `npm run owner -- "<name>"`); never as root | Done |
| 3 | Sign in as the owner over the tailnet, set each worker's PIN in Settings → Workers | Done |
| 4 | Check a worker sign-in on a phone, then `sudo tailscale funnel --bg 8080` (the farm app only; 8090, 8092 to 8094 stay on `tailscale serve`) | Done; Funnel on at https://mushroom-farm.tail04f685.ts.net |
| 5 | README: the "no login" line in Run on a cloud VM replaced; a Login paragraph with the routes and the known limits; PRODUCT.md and DESIGN.md for the sign-in view | Done 2026-11-10 |
| Off | Funnel off (the tailnet only): `sudo tailscale funnel --bg 8080 off && sudo tailscale serve --bg 8080` | If ever needed |

The farm app still listens on every interface, so `http://100.116.49.119:8080` on the tailnet keeps working (the owner's wish); the cookie is `Secure` only through Tailscale's proxy.

## 9. What shipped beyond the first version of this spec

| Where | Change |
|---|---|
| 4, "Who is recorded" | An owner's body is as sent; their dialogs pick their own name first (the server fills `worker` only for a worker: an owner's `worker` on a cost is the labour worker, not the one typing) |
| 4, the gate | `/api/settings` for a worker is only `pollSeconds`; `MONEY_KEYS` also leaves out `unpriced` and `missing` (Settings → Yield is the owner's to fix) |
| 5, the role | A new role clears the secret (a PIN is no password) |
| 5, the routes | `GET /api/workers/accounts` (the sign-in state is its own read; `GET /api/workers` stays the names) |
| 4, a worker's replies | A room's History keeps its kWh and litres for a worker (usage without RM; `/usage`, with RM, stays the owner's); a room's Modbus gateway and addresses stay in `GET /api/rooms` for a worker (they are signed-in staff; the farm's own gateway is in Settings, which they do not get) |
| 5, the owner | "Keeps an owner" means an owner who can sign in (active, with a password); a role change clears the secret, the tries and the lock in one step; Set password is not for your own row (Change password is); Unlock and Sign out everywhere take no body, so they need no Content-Type (the cookie's SameSite=Strict covers them, as it covers Undo) |
| 4, the worker table | "See the farm" also lists `GET /api/rooms/:id/alarms` and `GET /api/rooms/:id/filter/changes` (reading only; acknowledging an alarm and recording a filter change stay the owner's) |
| 4, known limits | Undo compares the worker's name, not their id (after a rename a worker cannot undo their own earlier Done; a freed name given to someone new could undo the old holder's); `npm run owner` on the VM is `sudo -u farm FARM_DB=… node … server/owner.js` (never as root) |
| 6, Start | The session is asked by `web/boot.js`, not app.js (app.js opens the live stream as it loads) |
| 5, Top bar | The name and Sign out only; an owner's own password is the Your password card, first on Settings (no top-bar Change password); an owner's own row in Settings → Workers has no Set password and no Remove |
| 7, Allow-list walk | The walk is the table in `tests/api-login.test.js`; a route not in `roles.js` is closed to workers whether or not the table has it |
| 3, the cookie | `Secure` only through Tailscale's proxy, so plain http on the tailnet IP signs in (no `FARM_HOST`, no listening on 127.0.0.1 only) |
| 3, the address | Each tailnet device counts on its own, not by the tailnet's shared /64; a request Tailscale marks as Funnel is always the internet |
| 3, lockout | 5 wrong tries lock a name for that address only (15 minutes); a worker's 20 wrong tries in a day, from any addresses, lock them until the owner's Unlock, with a Telegram note at 10 and at the lock; an owner has no daily lock |
| 3, passwords and PINs | An owner's password is 14 characters or more with no name part, farm or common word, or word and year; common PINs (pairs, triples, runs, keypad lines, dates) are refused |
| 3, the internet's budget | 600 checked tries per 15 minutes from the internet; 12 of the 16 checks at once; the tailnet always keeps capacity; a spent budget says the app is getting too many sign-ins |
| 4, the live stream | Follows the session (ends within a ping, 25 s, after it ends); 3 per sign-in, 6 per person, 4 places kept for owners (this replaces "an open live stream outlives sign-out") |
| 4, writes and headers | A write whose `Sec-Fetch-Site` says another site is refused; security headers on pages and API; page files gzipped with an ETag and 304 |
| 6, Couldn't load | The 8 s warning waits for a real failure (or 90 s) |
| 1, scope | The owner chose to sign in from anywhere, not the tailnet only. Known limits, said in README's Run on a cloud VM: the names list is public; anyone can keep a worker locked (the owner unlocks; sessions already open keep working); anyone can spend the internet budget and block internet sign-ins for 15 minutes at a time (the tailnet is not affected); counts are in memory, so a restart resets them; undo compares names; a revoked live stream may run up to 25 s |

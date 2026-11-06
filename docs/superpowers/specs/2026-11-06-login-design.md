# Login: who is using the farm app, and what they may see

Date: 2026-11-06 · Branch `feat/login` from `v2` at `917219b` · Database version 25

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
| Lockout after wrong tries, per account and per address | Captcha, two-factor |
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
| PIN | Exactly 6 digits when a PIN is set (400 otherwise, field `secret`); not all one digit, not 123456 or 654321. Signing in with a PIN of any shape is only "That PIN is not right" (401) |
| Password | 12 to 200 characters when set |
| Lockout, account | 5 wrong tries in a row lock the account 15 minutes; the owner can unlock in Settings → Workers |
| Lockout, address | 20 tries in 15 minutes from one address get 429 for the rest of the window (in memory). The address is `X-Forwarded-For`'s last entry (the one Tailscale's proxy adds) when the request comes from 127.0.0.1 (Tailscale's proxy), else the socket's |
| Log | Every try to the app's log: time, address, worker id, right / wrong / locked; never the secret |
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

Cross-site writes: the cookie is `SameSite=Strict` and every write needs `Content-Type: application/json` (415 otherwise,
as now), which a page on another site cannot send without the browser asking first; no other check is added.

## 5. Owner's tools

| Item | Rule |
|---|---|
| First owner | `npm run owner -- "<name>"` (`server/owner.js`) on the VM as the `farm` user, with the app's `FARM_DB`: finds or adds the worker of that name, makes them owner, asks for the password twice without echo, deletes their sessions. It is also how a lost owner password is reset. |
| Settings → Workers | Each row: role (Owner / Worker), **Set PIN** or **Set password**, Locked until … with **Unlock**, Signed in on N devices with **Sign out everywhere**. `POST /api/workers/:id/secret` `{ secret }`, `PUT /api/workers/:id/role` `{ role }` (not the last owner: 400 "The farm needs an owner"), `POST /api/workers/:id/unlock`, `POST /api/workers/:id/sign-out` |
| Top bar | The name signed in and **Sign out**; an owner also **Change password** (Settings) |

## 6. The pages

| Item | Rule |
|---|---|
| Start | `web/app.js` asks `GET /api/session` first; 401 shows the sign-in view, else the pages for the role |
| Sign-in view | `web/login.js` (and `web/login-math.js`): the names as buttons (44 px), then one PIN box (`inputmode="numeric"`, `autocomplete="off"`, 6 digits) or a password box (`autocomplete="current-password"`); the error under the box, said once (aria-live); light and dark themes, phone and desk |
| 401 later | `web/api.js`: any 401 (a session expired or signed out elsewhere) shows the sign-in view and returns to the same `#/…` after |
| 403 | "Ask the owner" in the page's error place |
| Worker menu | Today, Calendar, Overview, Rooms, Harvest, Inventory (Record use, Count stock). Hidden: Business, Settings, a room's Setup, Control, Simulations, Usage; money figures are not drawn when the reply leaves them out |
| Doing the rounds as | Gone: the picker and its kept name; Done is one tap for tasks with no amount |

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

| Step | What |
|---|---|
| 1 | Copy `data/v2.db` (to `data/v2-before-login.db`), deploy with `deploy/oracle/push-code.sh`; the app moves the database to 25. From now on nobody is signed in. |
| 2 | `ssh oracle-farm`, `cd /opt/mushroom-farm && sudo -u farm FARM_DB=/opt/mushroom-farm/data/v2.db npm run owner -- "<name>"` |
| 3 | Sign in as the owner over the tailnet, set each worker's PIN in Settings → Workers |
| 4 | Check a worker sign-in on a phone, then `sudo tailscale funnel --bg 8080` (the farm app only; 8090, 8092 to 8094 stay on `tailscale serve`) |
| 5 | README: the "no login" line in Run on a cloud VM replaced; a Login paragraph with the routes; PRODUCT.md and DESIGN.md for the sign-in view |

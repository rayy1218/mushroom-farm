// Signing in (spec 2026-11-06-login-design.md 3): the secrets' scrypt hashes, the PIN and password rules, the session's
// token and cookie, the client's address; createAuth (below) signs in and out and finds the session of a request.

import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { localTime } from './task-rules.js';

const scryptAsync = promisify(scrypt);
const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_BYTES = 32;
const MAXMEM = 64 * 1024 * 1024; // N 2^15 with r 8 needs 32 MiB, Node's default limit exactly
export const COOKIE = 'farm_session';
const DAY_MS = 86_400_000;
export const SESSION_MS = { worker: 30 * DAY_MS, owner: 7 * DAY_MS };

// → 'scrypt$N$r$p$<salt>$<hash>' (base64).
export async function hashSecret(secret) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(secret.normalize('NFC'), salt, KEY_BYTES, { ...COST, maxmem: MAXMEM });
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// → true when secret is the one stored hashed (a stored value not of hashSecret's shape: false).
export async function checkSecret(secret, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt' || typeof secret !== 'string') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const want = Buffer.from(parts[5], 'base64');
  if (!(Number.isInteger(N) && N > 1 && N <= 2 ** 20 && Number.isInteger(r) && r >= 1 && r <= 32 && Number.isInteger(p) && p >= 1 && p <= 16) || want.length < 16 || want.length > 64) return false;
  try {
    const got = await scryptAsync(secret.normalize('NFC'), salt, want.length, { N, r, p, maxmem: MAXMEM });
    return timingSafeEqual(got, want);
  } catch {
    return false; // a stored hash scrypt refuses: not a match
  }
}

// The keypad's lines of three (rows, columns, diagonals, each both ways); two of them make a common PIN (147258, 963852).
const KEYPAD_LINES = ['123', '456', '789', '147', '258', '369', '159', '357'].flatMap((l) => [l, [...l].reverse().join('')]);
const KEYPAD = new Set(KEYPAD_LINES.flatMap((a) => KEYPAD_LINES.filter((b) => b !== a).map((b) => a + b)));
const isDay = (n) => n >= 1 && n <= 31;
const isMonth = (n) => n >= 1 && n <= 12;

// A PIN people pick first: one digit, a pair or a triple repeated (121212, 123123), doubled or tripled digits (112233,
// 111222), a run up or down (234567, 987654, 890123), two keypad lines, or a date (DDMMYY, YYMMDD, MMDDYY).
function commonPin(pin) {
  if (/^(\d)\1{5}$|^(\d\d)\2\2$|^(\d{3})\3$|^(\d)\4(\d)\5(\d)\6$|^(\d)\7\7(\d)\8\8$/.test(pin)) return true;
  const steps = [...pin].slice(1).map((d, i) => (Number(d) - Number(pin[i]) + 10) % 10);
  if (steps.every((x) => x === 1) || steps.every((x) => x === 9)) return true;
  if (KEYPAD.has(pin)) return true;
  const [a, b, c] = [0, 2, 4].map((i) => Number(pin.slice(i, i + 2)));
  return (isDay(a) && isMonth(b)) || (isMonth(b) && isDay(c)) || (isMonth(a) && isDay(b));
}

// A worker's PIN: exactly 6 digits, not a common one. → the error, or null.
export function pinError(pin) {
  if (typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) return 'The PIN must be 6 digits';
  if (commonPin(pin)) return 'Pick a PIN that is harder to guess';
  return null;
}

const GUESSABLE_PARTS = ['mushroom', 'farm', 'password', 'qwerty', 'letmein', '123456', 'abcdef'];

// An owner's password (the owner signs in from anywhere: Funnel): 14 to 200 characters; not holding the person's name (or
// a word of it of 3 letters or more), a farm word or a common one; not one word with digits (a year) and symbols; 6
// different characters or more. Checked where a password is set (accounts-api.js, changePassword, owner.js); passwords
// set before these rules are not checked again. name: the owner's. → the error, or null.
export function passwordError(password, { name = '' } = {}) {
  const text = typeof password === 'string' ? password.normalize('NFC') : '';
  const chars = [...text];
  if (chars.length < 14) return 'Use at least 14 characters, for example four random words';
  if (chars.length > 200) return 'The password must be at most 200 characters';
  const lower = text.toLowerCase();
  const whole = String(name ?? '').normalize('NFC').toLowerCase().trim();
  const names = [whole, ...whole.split(/\s+/)].filter((part) => [...part].length >= 3);
  if ([...GUESSABLE_PARTS, ...names].some((part) => lower.includes(part))
    || /^[a-z]+[^a-z0-9]*[0-9]{2,}[^a-z0-9]*$/i.test(text)
    || new Set(lower).size < 6) {
    return 'Pick a password that is harder to guess (no names, farm words or a word with a year)';
  }
  return null;
}

export const newToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

// The value of the cookie name in a Cookie header, or null.
export function readCookie(header, name = COOKIE) {
  for (const part of String(header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim() || null;
  }
  return null;
}

// secure: the request came through Tailscale's https proxy (viaProxy). Straight to the app on the tailnet IP it is plain
// http, which a browser would not keep a Secure cookie from; that traffic is inside Tailscale's encrypted tunnel, and the
// app's port is not open to the internet, so the cookie goes without Secure there.
const flags = (secure) => `HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Path=/`;
export const sessionCookie = (token, ms, secure = true) => `${COOKIE}=${token}; ${flags(secure)}; Max-Age=${Math.floor(ms / 1000)}`;
export const clearCookie = (secure = true) => `${COOKIE}=; ${flags(secure)}; Max-Age=0`;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
// The request came from this machine: Tailscale's proxy (serve or Funnel, https), or a browser on the farm computer itself.
export const viaProxy = (req) => LOOPBACK.has(req.socket?.remoteAddress ?? '');

// Who is asking, for the per-address limit: behind Tailscale (serve or Funnel) the request comes from this machine and
// the proxy adds the client to X-Forwarded-For's end (one trusted hop; an earlier entry is the client's own word); from
// anywhere else the header is ignored.
export function clientAddress(req) {
  const socket = req.socket?.remoteAddress ?? '';
  const forwarded = viaProxy(req) ? String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim() : '';
  return forwarded || socket;
}

// The request came from the tailnet (Tailscale's 100.64.0.0/10 or fd7a:115c:a1e0::/48, straight or through serve), or from
// a browser on the farm computer (this machine, no X-Forwarded-For); else from the internet (Funnel).
export function fromTailnet(req) {
  if (req.headers['tailscale-funnel-request']) return false; // Tailscale marks a Funnel request (one that adds it only hurts itself)
  if (viaProxy(req) && !String(req.headers['x-forwarded-for'] ?? '').trim()) return true;
  const raw = clientAddress(req).toLowerCase();
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(raw);
  if (v4) return Number(v4[1]) === 100 && Number(v4[2]) >= 64 && Number(v4[2]) <= 127;
  return raw.startsWith('fd7a:115c:a1e0:');
}

// LOCK: wrong tries in a row at one account from one address (addressKey) lock the account for that address only (a
// stranger cannot lock the owner or a worker out from elsewhere). DAILY: a worker's wrong tries in 24 hours from any
// addresses, after which the account is locked until the owner's Unlock (a 6-digit PIN is not tried slowly for days), with
// a warning note at `warn`; an owner has none (a 14+ character password; a daily lock would let a stranger lock the owner
// out). ADDRESS_LIMIT: an address's tries at any accounts. INTERNET: the tries from the internet (not fromTailnet) at all
// accounts, checked, in 15 minutes, and the scrypt checks they may hold at once (the rest of MAX_CHECKING is the tailnet's).
export const LOCK = { tries: 5, ms: 15 * 60_000 };
export const DAILY = { tries: 20, warn: 10, ms: DAY_MS };
export const ADDRESS_LIMIT = { tries: 20, ms: 15 * 60_000 };
export const INTERNET = { tries: 600, ms: 15 * 60_000, checking: 12 };
// The stored lock (workers.locked_until) of the daily cap: the last ms a Date holds, so "until the owner unlocks"
// (web/settings-math.js mirrors it).
export const LOCKED_UNTIL_UNLOCKED = 8.64e15;
const NOTE_MS = 3_600_000; // at most one Telegram note an hour per account of an address's lock
const REFUSED_LOG_MS = 60_000; // a refused try's log line: one a minute per kind, then how many more
const MAX_CHECKING = 16; // scrypt checks (32 MiB each) in flight at once
const MAX_ADDRESSES = 10_000;
const MAX_ACCOUNT_ADDRESSES = 10_000;
const MAX_SECRET = 1024;
const TOUCH_MS = 3_600_000; // a session's last_seen and expiry are written at most once an hour

// The key an address is counted under: an IPv4-mapped IPv6 address as its IPv4, another IPv6 address by its /64 (one
// customer holds a whole /64), an IPv4 address as it is.
export function addressKey(address) {
  const a = String(address).toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return mapped[1];
  if (!a.includes(':')) return a;
  const [head, tail = null] = a.split('::');
  const first = head === '' ? [] : head.split(':');
  const last = tail === null || tail === '' ? [] : tail.split(':');
  const groups = tail === null ? first : [...first, ...Array(Math.max(0, 8 - first.length - last.length)).fill('0'), ...last];
  const short = groups.map((g) => g.replace(/^0+(?=.)/, ''));
  // The tailnet's devices share their first 96 bits (fd7a:115c:a1e0::/48): each counts on its own, so one device's tries
  // never hold back another's.
  if (a.startsWith('fd7a:115c:a1e0:')) return short.join(':');
  return `${short.slice(0, 4).join(':')}::/64`;
}

// db: the farm database. log(line): one line per sign-in try (never the secret; refused ones at most a line a minute per
// kind). notify(text): a note for the owner (a Telegram message: server/login-alerts.js) when an address locks an account,
// or a worker reaches the daily warning or cap; not awaited, its failure only logged. check: checkSecret (tests make the slow check's wait their own). → { names(), login(req, body),
// who(req, res), logout(req), changePassword(req, me, body), unlocked(id), prune(), close() }. login and changePassword →
// { status, body, cookie? }.
export function createAuth({ db, now = Date.now, log = (line) => console.log(line), notify = () => {}, check = checkSecret }) {
  // All the counts are in memory: a restart starts them again (a restart is rare, and an attacker cannot cause one).
  // address → { count, until }: the tries of the address's current 15 minutes; in order of their windows' start.
  const tries = new Map();
  // `${account id} ${address}` → { count, lockedUntil, seen }: the account's wrong tries in a row from the address, and its
  // lock there. Forgotten when the lock ends, or a day after the last try.
  const accountTries = new Map();
  // worker id → { count, until, locked, warned, noted }: the tries of the worker's current 24 hours; locked: it stored the
  // daily lock.
  const daily = new Map();
  const addressLocks = new Map(); // account id → { notedAt, times }: its addresses' locks of the last hour, its last note
  const refusedLog = new Map(); // kind → { since, more }: the refused tries' log line of the minute, and those not logged
  let budget = { count: 0, until: 0 }; // the internet's checked tries of its current 15 minutes
  // The hash an unknown name is checked against, so it takes as long as a known one; made at start, so the first unknown
  // name after a restart is not slower.
  const dummy = hashSecret(newToken());
  dummy.catch(() => {}); // an early failure is not an unhandled rejection; login still awaits it
  let checking = 0;
  let internetChecking = 0;
  const iso = (t) => new Date(t).toISOString();

  const wrong = (role) => ({ status: 401, body: { error: role === 'owner' ? 'That password is not right' : 'That PIN is not right', field: 'secret' } });
  const lockedReply = (until) => ({ status: 429, body: { error: `Too many tries. Try again at ${localTime(until)}` } });
  const lockedTodayReply = () => ({ status: 429, body: { error: 'Locked: ask the owner to unlock you' } });
  const accountExpired = (e, t) => (e.lockedUntil ?? e.seen + DAY_MS) <= t;

  // The note goes on its own: login never waits for it, and its failure is only a log line.
  function tell(text) {
    const failed = (err) => log(`login note failed: ${err?.message ?? err}`);
    try {
      Promise.resolve(notify(text)).catch(failed);
    } catch (err) {
      failed(err);
    }
  }

  // A refused try (before any check): its line, at most one a minute per kind; the next says how many more there were.
  function refused(kind, line, t) {
    const r = refusedLog.get(kind);
    if (r && t - r.since < REFUSED_LOG_MS) {
      r.more += 1;
      return;
    }
    if (r?.more) log(`login ${iso(t)} ${kind}: ${r.more} more refused since ${iso(r.since)}`);
    refusedLog.set(kind, { since: t, more: 0 });
    line();
  }

  function flushRefused(t) {
    for (const [kind, r] of refusedLog) {
      if (t - r.since < REFUSED_LOG_MS) continue;
      if (r.more) log(`login ${iso(t)} ${kind}: ${r.more} more refused since ${iso(r.since)}`);
      refusedLog.delete(kind);
    }
  }

  // Counts the try; → true when the address has had more than its tries in its window. An ended window starts again at the
  // map's end, so the first entry is the oldest window: a full map drops it (a full map never refuses a new address).
  function overLimit(address, t) {
    const seen = tries.get(address);
    if (seen && seen.until > t) {
      seen.count += 1;
      return seen.count > ADDRESS_LIMIT.tries;
    }
    tries.delete(address);
    while (tries.size >= MAX_ADDRESSES) tries.delete(tries.keys().next().value);
    tries.set(address, { count: 1, until: t + ADDRESS_LIMIT.ms });
    return false;
  }

  // Counts a try at a usable account (before the slow check, so tries in flight together each see the ones before them).
  // → { entry, addressLock: the lock's end when this try locked the address, else null; day: the worker's 24 hours or null }.
  // The try that reaches the daily cap stores the lock at once (day.locked).
  function countTry(account, key, t) {
    let entry = accountTries.get(key);
    if (!entry || accountExpired(entry, t)) {
      if (!entry && accountTries.size >= MAX_ACCOUNT_ADDRESSES) {
        sweepTries(t);
        // still full: the oldest goes (a full map must not refuse the right secret from a new address)
        if (accountTries.size >= MAX_ACCOUNT_ADDRESSES) accountTries.delete(accountTries.keys().next().value);
      }
      entry = { count: 0, lockedUntil: null, seen: t };
      accountTries.set(key, entry);
    }
    entry.count += 1;
    entry.seen = t;
    const addressLock = entry.count >= LOCK.tries ? t + LOCK.ms : null;
    if (addressLock !== null) entry.lockedUntil = addressLock;
    let day = null;
    if (account.role === 'worker') {
      day = daily.get(account.id);
      if (!day || day.until <= t) {
        day = { count: 0, until: t + DAILY.ms, locked: false, warned: false, noted: false };
        daily.set(account.id, day);
      }
      day.count += 1;
      if (day.count >= DAILY.tries && !day.locked) {
        db.setTries(account.id, 0, LOCKED_UNTIL_UNLOCKED);
        day.locked = true;
      }
    }
    return { entry, addressLock, day };
  }

  function startSession(req, account, t) {
    const token = newToken();
    const ms = SESSION_MS[account.role];
    const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 200) || null;
    db.addSession({ tokenHash: tokenHash(token), workerId: account.id, at: t, expiresAt: t + ms, userAgent });
    return sessionCookie(token, ms, viaProxy(req));
  }

  // An address locked the account: noted in its hour, and a note to the owner at most once an hour.
  function addressLocked(account, raw, until, t) {
    let seen = addressLocks.get(account.id);
    if (!seen) {
      seen = { notedAt: null, times: [] };
      addressLocks.set(account.id, seen);
    }
    seen.times = seen.times.filter((at) => t - at < NOTE_MS);
    seen.times.push(t);
    if (seen.notedAt !== null && t - seen.notedAt < NOTE_MS) return;
    seen.notedAt = t;
    const n = seen.times.length;
    tell(`🔒 Sign-in: ${LOCK.tries} wrong tries for ${account.name} from ${raw}; locked for that address until ${localTime(until)}`
      + ` (${n} address ${n === 1 ? 'lock' : 'locks'} in the last hour)`);
  }

  async function login(req, body) {
    const t = now();
    const raw = clientAddress(req);
    const address = addressKey(raw); // counted by key, logged as it came
    const internet = !fromTailnet(req);
    const id = Number.isSafeInteger(body?.id) ? body.id : null;
    const secret = typeof body?.secret === 'string' && body.secret.length <= MAX_SECRET ? body.secret : '';
    const note = (result) => log(`login ${iso(t)} ${raw} worker ${id ?? '-'} ${result}`);
    const refuse = (kind, reply) => {
      refused(kind, () => note(kind), t);
      return reply;
    };
    const fromHere = { status: 429, body: { error: 'Too many tries from here. Try again in 15 minutes' } };
    if (overLimit(address, t)) return refuse('address-limited', fromHere);
    if (checking >= MAX_CHECKING || (internet && internetChecking >= INTERNET.checking)) {
      return refuse('busy', { status: 503, body: { error: 'The farm app is busy. Try again in a moment' } });
    }
    const account = id === null ? null : db.account(id);
    const usable = Boolean(account?.active && account.secretHash !== null);
    if (usable && account.lockedUntil !== null && account.lockedUntil > t) {
      // (a 15-minute lock stored before the locks were per address runs out as it was)
      return refuse('locked', account.lockedUntil >= LOCKED_UNTIL_UNLOCKED ? lockedTodayReply() : lockedReply(account.lockedUntil));
    }
    const key = usable ? `${account.id} ${address}` : null;
    const held = key && accountTries.get(key);
    if (held && held.lockedUntil !== null && held.lockedUntil > t) return refuse('locked-here', lockedReply(held.lockedUntil));
    if (internet) {
      if (budget.until <= t) budget = { count: 0, until: t + INTERNET.ms };
      if (budget.count >= INTERNET.tries) {
        return refuse('budget', { status: 429, body: { error: 'The farm app is getting too many sign-ins. Try again in 15 minutes' } });
      }
      budget.count += 1;
    }
    // Count the try before the slow check (no await between the read and the write).
    const counted = usable ? countTry(account, key, t) : null;
    checking += 1;
    if (internet) internetChecking += 1;
    let right;
    try {
      right = await check(secret, usable ? account.secretHash : await dummy);
    } finally {
      checking -= 1;
      if (internet) internetChecking -= 1;
    }
    if (!usable) {
      note('unknown');
      return wrong(account?.role);
    }
    const { entry, addressLock, day } = counted;
    // (an Unlock while the check ran cleared the counts: what they said then no longer holds)
    const today = day !== null && daily.get(account.id) === day;
    if (!right) {
      if (today && day.locked) {
        note('wrong-locked-day');
        if (!day.noted) {
          day.noted = true;
          tell(`🔒 Sign-in: ${account.name} locked after ${DAILY.tries} wrong tries today; unlock in Settings → Workers`);
        }
        return lockedTodayReply();
      }
      if (today && !day.warned && day.count >= DAILY.warn) {
        day.warned = true;
        tell(`⚠️ Sign-in: ${DAILY.warn} wrong tries for ${account.name} today`);
      }
      if (addressLock === null || accountTries.get(key) !== entry) {
        note('wrong');
        return wrong(account.role);
      }
      note('wrong-locked');
      addressLocked(account, raw, addressLock, t);
      return lockedReply(addressLock);
    }
    // The right secret: not a wrong try. This address's count starts again; the daily count drops it, and the lock when the
    // tries left no longer reach the cap.
    accountTries.delete(key);
    if (today) {
      day.count -= 1;
      if (day.locked && day.count < DAILY.tries) {
        db.setTries(account.id, 0, null);
        day.locked = false;
      }
    }
    // The account as it is now: a change of the secret, the role or active while the check ran answers as a wrong secret.
    const fresh = db.account(account.id);
    if (!fresh?.active || fresh.role !== account.role || fresh.secretHash !== account.secretHash) {
      note('changed');
      return wrong(account.role);
    }
    if (fresh.lockedUntil !== null && fresh.lockedUntil >= LOCKED_UNTIL_UNLOCKED) {
      note('locked');
      return lockedTodayReply();
    }
    note('right');
    return { status: 200, body: { id: fresh.id, name: fresh.name, role: fresh.role }, cookie: startSession(req, fresh, t) };
  }

  // The owner unlocked the account, or set its secret or role (accounts-api.js): its counts start again.
  function unlocked(id) {
    daily.delete(id);
    for (const key of accountTries.keys()) if (key.startsWith(`${id} `)) accountTries.delete(key);
  }

  // The person of the request's session: { id, name, role, sessionId }, or null. An hour or more since it was last seen,
  // its expiry moves on and res gets the cookie again.
  function who(req, res) {
    const token = readCookie(req.headers.cookie);
    if (!token) return null;
    const t = now();
    const s = db.session(tokenHash(token));
    if (!s) return null;
    if (!s.active || s.expiresAt <= t) {
      db.endSession(s.id);
      return null;
    }
    if (t - s.lastSeen >= TOUCH_MS) {
      const ms = SESSION_MS[s.role];
      db.touchSession(s.id, t, t + ms);
      res.setHeader('set-cookie', sessionCookie(token, ms, viaProxy(req)));
    }
    return { id: s.workerId, name: s.name, role: s.role, sessionId: s.id };
  }

  // The role of the request's session while it holds (there, not expired, its worker active), else null. Only reads (no
  // touch, no cookie): the live stream asks it at every ping (app.js, live.js), on a reply whose headers have gone, and
  // ends when it is not the role the stream opened with.
  function alive(req) {
    const token = readCookie(req.headers.cookie);
    const s = token && db.session(tokenHash(token));
    return s && s.active && s.expiresAt > now() ? s.role : null;
  }

  function logout(req) {
    const token = readCookie(req.headers.cookie);
    const s = token && db.session(tokenHash(token));
    if (s) db.endSession(s.id);
  }

  // An owner's own password { current, next }: every session of theirs ends and this browser (req) gets a new one.
  async function changePassword(req, me, body) {
    const account = db.account(me.id);
    if (account?.role !== 'owner') return { status: 403, body: { error: 'Ask the owner' } };
    const note = (result) => log(`password ${new Date(now()).toISOString()} worker ${me.id} ${result}`);
    const current = typeof body?.current === 'string' ? body.current : '';
    if (!(await checkSecret(current, account.secretHash))) {
      note('wrong');
      return { status: 400, body: { error: 'That password is not right', field: 'current' } };
    }
    const problem = passwordError(body?.next, { name: account.name });
    if (problem) return { status: 400, body: { error: problem, field: 'next' } };
    db.setSecret(account.id, await hashSecret(body.next));
    note('right');
    return { status: 204, body: null, cookie: startSession(req, account, now()) };
  }

  function sweepTries(t) {
    for (const [address, seen] of tries) if (seen.until <= t) tries.delete(address);
    for (const [key, entry] of accountTries) if (accountExpired(entry, t)) accountTries.delete(key);
    for (const [id, day] of daily) if (day.until <= t) daily.delete(id);
    for (const [id, seen] of addressLocks) {
      if ((seen.notedAt === null || t - seen.notedAt >= NOTE_MS) && seen.times.every((at) => t - at >= NOTE_MS)) addressLocks.delete(id);
    }
    flushRefused(t);
  }

  function prune() {
    const t = now();
    db.pruneSessions(t);
    sweepTries(t);
  }

  prune();
  const timer = setInterval(() => { try { prune(); } catch (err) { log(`login prune failed: ${err.message}`); } }, TOUCH_MS);
  timer.unref();
  return { names: () => db.loginNames(), login, who, alive, logout, changePassword, unlocked, prune, close: () => clearInterval(timer) };
}

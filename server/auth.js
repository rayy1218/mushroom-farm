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

// A worker's PIN: exactly 6 digits, not one digit six times, not 123456 or 654321. → the error, or null.
export function pinError(pin) {
  if (typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) return 'The PIN must be 6 digits';
  if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') return 'Pick a PIN that is harder to guess';
  return null;
}

// An owner's password: 12 to 200 characters. → the error, or null.
export function passwordError(password) {
  const length = typeof password === 'string' ? [...password.normalize('NFC')].length : 0;
  if (length < 12) return 'The password must be at least 12 characters';
  if (length > 200) return 'The password must be at most 200 characters';
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

export const sessionCookie = (token, ms) => `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(ms / 1000)}`;
export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

// Who is asking, for the per-address limit: behind Tailscale (serve or Funnel) the request comes from this machine and
// the proxy adds the client to X-Forwarded-For's end (one trusted hop; an earlier entry is the client's own word); from
// anywhere else the header is ignored.
export function clientAddress(req) {
  const socket = req.socket?.remoteAddress ?? '';
  const local = socket === '127.0.0.1' || socket === '::1' || socket === '::ffff:127.0.0.1';
  const forwarded = local ? String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim() : '';
  return forwarded || socket;
}

export const LOCK = { tries: 5, ms: 15 * 60_000 };
export const ADDRESS_LIMIT = { tries: 20, ms: 15 * 60_000 };
const TOUCH_MS = 3_600_000; // a session's last_seen and expiry are written at most once an hour

// db: the farm database. log(line): one line per sign-in try (never the secret). → { names(), login(req, body), who(req,
// res), logout(req), changePassword(req, me, body), prune(), close() }. login and changePassword → { status, body, cookie? }.
export function createAuth({ db, now = Date.now, log = (line) => console.log(line) }) {
  const tries = new Map(); // address → { count, until }: the tries of the address's current 15 minutes
  // The hash an unknown name is checked against, so it takes as long as a known one; made at start, so the first unknown
  // name after a restart is not slower.
  const dummy = hashSecret(newToken());

  const wrong = (role) => ({ status: 401, body: { error: role === 'owner' ? 'That password is not right' : 'That PIN is not right', field: 'secret' } });
  const lockedReply = (until) => ({ status: 429, body: { error: `Too many tries. Try again at ${localTime(until)}` } });

  // Counts the try; → true when the address has had more than its tries in its window.
  function overLimit(address, t) {
    const seen = tries.get(address);
    if (!seen || seen.until <= t) {
      tries.set(address, { count: 1, until: t + ADDRESS_LIMIT.ms });
      return false;
    }
    seen.count += 1;
    return seen.count > ADDRESS_LIMIT.tries;
  }

  function startSession(req, account, t) {
    const token = newToken();
    const ms = SESSION_MS[account.role];
    const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 200) || null;
    db.addSession({ tokenHash: tokenHash(token), workerId: account.id, at: t, expiresAt: t + ms, userAgent });
    return sessionCookie(token, ms);
  }

  async function login(req, body) {
    const t = now();
    const address = clientAddress(req);
    const id = Number.isSafeInteger(body?.id) ? body.id : null;
    const secret = typeof body?.secret === 'string' ? body.secret : '';
    const note = (result) => log(`login ${new Date(t).toISOString()} ${address} worker ${id ?? '-'} ${result}`);
    if (overLimit(address, t)) {
      note('address-limited');
      return { status: 429, body: { error: 'Too many tries from here. Try again in 15 minutes' } };
    }
    const account = id === null ? null : db.account(id);
    const usable = Boolean(account?.active && account.secretHash !== null);
    if (usable && account.lockedUntil !== null && account.lockedUntil > t) {
      note('locked');
      return lockedReply(account.lockedUntil);
    }
    const right = await checkSecret(secret, usable ? account.secretHash : await dummy);
    if (!usable || !right) {
      note('wrong');
      if (!usable) return wrong(account?.role);
      const count = account.failedTries + 1;
      if (count >= LOCK.tries) {
        db.setTries(account.id, 0, t + LOCK.ms);
        return lockedReply(t + LOCK.ms);
      }
      db.setTries(account.id, count, null);
      return wrong(account.role);
    }
    db.setTries(account.id, 0, null);
    note('right');
    return { status: 200, body: { id: account.id, name: account.name, role: account.role }, cookie: startSession(req, account, t) };
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
      res.setHeader('set-cookie', sessionCookie(token, ms));
    }
    return { id: s.workerId, name: s.name, role: s.role, sessionId: s.id };
  }

  function logout(req) {
    const token = readCookie(req.headers.cookie);
    const s = token && db.session(tokenHash(token));
    if (s) db.endSession(s.id);
  }

  // An owner's own password { current, next }: every session of theirs ends and this browser (req) gets a new one.
  async function changePassword(req, me, body) {
    const account = db.account(me.id);
    const current = typeof body?.current === 'string' ? body.current : '';
    if (!account || !(await checkSecret(current, account.secretHash))) {
      return { status: 400, body: { error: 'That password is not right', field: 'current' } };
    }
    const problem = passwordError(body?.next);
    if (problem) return { status: 400, body: { error: problem, field: 'next' } };
    db.setSecret(account.id, await hashSecret(body.next));
    return { status: 204, body: null, cookie: startSession(req, account, now()) };
  }

  function prune() {
    const t = now();
    db.pruneSessions(t);
    for (const [address, seen] of tries) if (seen.until <= t) tries.delete(address);
  }

  prune();
  const timer = setInterval(prune, TOUCH_MS);
  timer.unref();
  return { names: () => db.loginNames(), login, who, logout, changePassword, prune, close: () => clearInterval(timer) };
}

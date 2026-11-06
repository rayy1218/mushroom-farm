// Signing in (spec 2026-11-06-login-design.md 3): the secrets' scrypt hashes, the PIN and password rules, the session's
// token and cookie, the client's address; createAuth (below) signs in and out and finds the session of a request.

import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

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
  if (!(N > 1 && r > 0 && p > 0) || want.length === 0) return false;
  const got = await scryptAsync(secret.normalize('NFC'), salt, want.length, { N, r, p, maxmem: MAXMEM });
  return timingSafeEqual(got, want);
}

// A worker's PIN: exactly 6 digits, not one digit six times, not 123456 or 654321. → the error, or null.
export function pinError(pin) {
  if (typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) return 'The PIN must be 6 digits';
  if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') return 'Pick a PIN that is harder to guess';
  return null;
}

// An owner's password: 12 to 200 characters. → the error, or null.
export function passwordError(password) {
  const length = typeof password === 'string' ? [...password].length : 0;
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
// X-Forwarded-For names the client; from anywhere else the header is the client's own word and is ignored.
export function clientAddress(req) {
  const socket = req.socket?.remoteAddress ?? '';
  const local = socket === '127.0.0.1' || socket === '::1' || socket === '::ffff:127.0.0.1';
  const forwarded = local ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
  return forwarded || socket;
}

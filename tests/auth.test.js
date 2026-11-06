// Signing in's parts (spec 2026-11-06-login-design.md 3): the scrypt hash, the PIN and password rules, the token, the cookie
// and the client's address.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashSecret, checkSecret, pinError, passwordError, newToken, tokenHash, readCookie, sessionCookie, clearCookie, clientAddress, viaProxy, COOKIE,
} from '../server/auth.js';

test('a hashed secret checks against itself only; each hash has its own salt', async () => {
  const h = await hashSecret('482913');
  assert.match(h, /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await checkSecret('482913', h), true);
  assert.equal(await checkSecret('482914', h), false);
  assert.notEqual(await hashSecret('482913'), h);
  assert.equal(await checkSecret('482913', null), false);
  assert.equal(await checkSecret('482913', 'garbage'), false);
  assert.equal(await checkSecret(undefined, h), false);
  assert.equal(await checkSecret('482913', h.replace('$32768$', '$1000$')), false);
  assert.equal(await checkSecret('482913', h.replace('$8$1$', '$8$1000$')), false);
});

test('a PIN is 6 digits, not one digit six times, not 123456 or 654321', () => {
  assert.equal(pinError('482913'), null);
  for (const bad of ['48291', '4829134', '48291a', '', 482913]) assert.equal(pinError(bad), 'The PIN must be 6 digits', String(bad));
  for (const easy of ['000000', '777777', '123456', '654321']) assert.equal(pinError(easy), 'Pick a PIN that is harder to guess', easy);
});

test('a password is 12 to 200 characters', () => {
  assert.equal(passwordError('a'.repeat(12)), null);
  assert.equal(passwordError('a'.repeat(11)), 'The password must be at least 12 characters');
  assert.equal(passwordError('a'.repeat(201)), 'The password must be at most 200 characters');
  assert.equal(passwordError('e\u0301'.repeat(6)), 'The password must be at least 12 characters'); // 12 code points, 6 characters once normalized
  assert.equal(passwordError(null), 'The password must be at least 12 characters');
});

test('a token is 32 random bytes in base64url; only its SHA-256 is kept', () => {
  const t = newToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(newToken(), t);
  assert.match(tokenHash(t), /^[0-9a-f]{64}$/);
  assert.equal(tokenHash(t), tokenHash(t));
});

test('the cookie: read from among others; set HttpOnly, Secure, SameSite=Strict for its length; cleared', () => {
  assert.equal(readCookie(`theme=dark; ${COOKIE}=abc_-1; x=y`), 'abc_-1');
  assert.equal(readCookie('theme=dark'), null);
  assert.equal(readCookie(undefined), null);
  assert.equal(sessionCookie('abc', 30 * 86_400_000), 'farm_session=abc; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000');
  assert.equal(clearCookie(), 'farm_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  assert.equal(sessionCookie('abc', 1000, false), 'farm_session=abc; HttpOnly; SameSite=Strict; Path=/; Max-Age=1', 'over the tailnet IP (http)');
  assert.equal(clearCookie(false), 'farm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
});

test("the client's address: X-Forwarded-For's last entry, only from Tailscale's proxy on this machine", () => {
  const req = (remoteAddress, xff) => ({ socket: { remoteAddress }, headers: xff ? { 'x-forwarded-for': xff } : {} });
  assert.equal(clientAddress(req('127.0.0.1', '203.0.113.9, 10.0.0.1')), '10.0.0.1');
  assert.equal(clientAddress(req('::ffff:127.0.0.1', '203.0.113.9')), '203.0.113.9');
  assert.equal(clientAddress(req('100.64.0.5', '203.0.113.9')), '100.64.0.5');
  assert.equal(clientAddress(req('127.0.0.1')), '127.0.0.1');
});

test("viaProxy: a request through Tailscale's https proxy comes from this machine; one to the tailnet IP does not", () => {
  const req = (remoteAddress) => ({ socket: { remoteAddress }, headers: {} });
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(viaProxy(req(a)), true, a);
  for (const a of ['100.64.0.5', '192.168.1.9', '']) assert.equal(viaProxy(req(a)), false, a);
});

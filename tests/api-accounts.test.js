// Settings → Workers' sign-in controls (spec 2026-11-06-login-design.md 5): the accounts, a PIN or a password set, the role,
// unlock, sign out everywhere, and the farm keeping an owner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashSecret, LOCKED_UNTIL_UNLOCKED } from '../server/auth.js';

async function farm(t) {
  const db = openDb(':memory:');
  const notes = [];
  const server = createApp(db, { loginNotify: (text) => { notes.push(text); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, cookie) => {
    const headers = { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) };
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, cookie: res.headers.get('set-cookie') };
  };
  db.setWorkers([{ name: 'Ali', active: true }]);
  const ali = db.listWorkers()[0].id;
  const ray = db.setOwner('Ray', await hashSecret('long enough password'));
  const signIn = async (id, secret) => /^farm_session=[^;]+/.exec((await call('POST', '/api/login', { id, secret })).cookie)[0];
  return { db, base, notes, call, ali, ray, signIn, owner: await signIn(ray, 'long enough password') };
}

test("the accounts: each worker's role, whether they can sign in, the lock and the browsers signed in", async (t) => {
  const { call, ali, ray, owner } = await farm(t);
  assert.deepEqual((await call('GET', '/api/workers/accounts', undefined, owner)).body, { accounts: [
    { id: ali, name: 'Ali', active: true, role: 'worker', hasSecret: false, lockedUntil: null, lockedHereUntil: null, sessions: 0 },
    { id: ray, name: 'Ray', active: true, role: 'owner', hasSecret: true, lockedUntil: null, lockedHereUntil: null, sessions: 1 },
  ] });
});

test('Set PIN: a worker\'s 6 digits; then they can sign in', async (t) => {
  const { call, ali, owner, signIn } = await farm(t);
  assert.deepEqual((await call('POST', `/api/workers/${ali}/secret`, { secret: '12345' }, owner)).body, { error: 'The PIN must be 6 digits', field: 'secret' });
  assert.deepEqual((await call('POST', `/api/workers/${ali}/secret`, { secret: '111111' }, owner)).body, { error: 'Pick a PIN that is harder to guess: no repeats, runs, keypad lines or dates', field: 'secret' });
  const set = await call('POST', `/api/workers/${ali}/secret`, { secret: '482913' }, owner);
  assert.deepEqual([set.status, set.body.account.hasSecret], [200, true]);
  assert.ok(await signIn(ali, '482913'));
  assert.equal((await call('POST', '/api/workers/9999/secret', { secret: '482913' }, owner)).status, 404);
});

test("Set password: an owner's 14 characters or more, not with their name", async (t) => {
  const { call, ali, owner } = await farm(t);
  await call('PUT', `/api/workers/${ali}/role`, { role: 'owner' }, owner); // not your own row: that is Change password
  assert.deepEqual((await call('POST', `/api/workers/${ali}/secret`, { secret: '482913' }, owner)).body,
    { error: 'Use at least 14 characters, for example four random words', field: 'secret' });
  assert.deepEqual((await call('POST', `/api/workers/${ali}/secret`, { secret: 'blue otter ALI cello' }, owner)).body,
    { error: 'Pick a password that is harder to guess (no names, farm words or a word with a year)', field: 'secret' });
  assert.equal((await call('POST', `/api/workers/${ali}/secret`, { secret: 'blue otter cello moss' }, owner)).status, 200);
});

test('the role: a change clears the secret (a PIN is no password) and signs them out; the last owner stays', async (t) => {
  const { db, call, ali, ray, owner, signIn } = await farm(t);
  await call('POST', `/api/workers/${ali}/secret`, { secret: '482913' }, owner);
  const aliCookie = await signIn(ali, '482913');
  const made = await call('PUT', `/api/workers/${ali}/role`, { role: 'owner' }, owner);
  assert.deepEqual([made.status, made.body.account.role, made.body.account.hasSecret], [200, 'owner', false]);
  assert.equal((await call('GET', '/api/session', undefined, aliCookie)).status, 401);
  assert.deepEqual((await call('PUT', `/api/workers/${ali}/role`, { role: 'boss' }, owner)).body, { error: 'The role must be owner or worker', field: 'role' });
  await call('PUT', `/api/workers/${ali}/role`, { role: 'worker' }, owner);
  assert.deepEqual((await call('PUT', `/api/workers/${ray}/role`, { role: 'worker' }, owner)).body, { error: 'The farm needs an owner', field: 'role' });
  assert.equal(db.account(ray).role, 'owner');
});

test("Unlock: a worker the daily cap locked signs in again and their counts start again; so after a new PIN", async (t) => {
  const { db, base, notes, call, ali, owner } = await farm(t);
  await call('POST', `/api/workers/${ali}/secret`, { secret: '482913' }, owner);
  // through Tailscale's proxy (from this machine) the client is X-Forwarded-For's last entry
  const login = (secret, address) => fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': address }, body: JSON.stringify({ id: ali, secret }),
  }).then((r) => r.status);
  const lockOut = async (net) => { for (let i = 0; i < 20; i++) await login('111112', `100.64.${net}.${Math.floor(i / 4)}`); };
  await lockOut(10);
  assert.equal(await login('482913', '100.64.11.1'), 429, 'the right PIN is refused');
  assert.deepEqual(notes, ['⚠️ Sign-in: 10 wrong tries for Ali today', '🔒 Sign-in: Ali locked after 20 wrong tries today; unlock in Settings → Workers'],
    "the owner's notes (app.js passes loginNotify to createAuth)");
  assert.equal(db.accounts(Date.now()).find((a) => a.id === ali).lockedUntil, LOCKED_UNTIL_UNLOCKED);
  assert.equal((await call('POST', `/api/workers/${ali}/unlock`, undefined, owner)).body.account.lockedUntil, null);
  assert.equal(await login('111112', '100.64.10.0'), 401, 'not locked again by the old counts');
  assert.equal(await login('482913', '100.64.10.0'), 200);
  await lockOut(12);
  assert.equal(await login('482913', '100.64.11.2'), 429);
  await call('POST', `/api/workers/${ali}/secret`, { secret: '593024' }, owner);
  assert.equal(await login('111112', '100.64.12.0'), 401, 'a new PIN: the counts start again');
  assert.equal(await login('593024', '100.64.12.0'), 200);
});

test("a worker locked for one address shows to the owner (lockedHereUntil, the latest such lock); Unlock clears it", async (t) => {
  const { base, call, ali, owner } = await farm(t);
  await call('POST', `/api/workers/${ali}/secret`, { secret: '482913' }, owner);
  const login = (secret, address) => fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': address }, body: JSON.stringify({ id: ali, secret }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const before = Date.now();
  for (let i = 0; i < 4; i++) await login('111112', '100.64.40.1');
  const locked = await login('111112', '100.64.40.1');
  assert.equal(locked.status, 429);
  assert.ok(locked.body.retryAt >= before + 15 * 60_000 && locked.body.retryAt <= Date.now() + 15 * 60_000, 'the 429 says when');
  const row = async () => (await call('GET', '/api/workers/accounts', undefined, owner)).body.accounts.find((a) => a.id === ali);
  assert.deepEqual([(await row()).lockedUntil, (await row()).lockedHereUntil], [null, locked.body.retryAt]);
  const unlocked = await call('POST', `/api/workers/${ali}/unlock`, undefined, owner);
  assert.equal(unlocked.body.account.lockedHereUntil, null);
  assert.equal((await row()).lockedHereUntil, null);
  assert.equal((await login('482913', '100.64.40.1')).status, 200, 'that address signs in again');
});

test('Sign out everywhere', async (t) => {
  const { call, ali, owner, signIn } = await farm(t);
  await call('POST', `/api/workers/${ali}/secret`, { secret: '482913' }, owner);
  const one = await signIn(ali, '482913');
  const out = await call('POST', `/api/workers/${ali}/sign-out`, undefined, owner);
  assert.equal(out.body.account.sessions, 0);
  assert.equal((await call('GET', '/api/session', undefined, one)).status, 401);
});

test('PUT /api/workers keeps an active owner', async (t) => {
  const { call, ali, ray, owner } = await farm(t);
  const r = await call('PUT', '/api/workers', { workers: [{ id: ali, name: 'Ali', active: true }] }, owner);
  assert.deepEqual([r.status, r.body.error], [400, 'The farm needs an owner']);
  const off = await call('PUT', '/api/workers', { workers: [{ id: ali, name: 'Ali', active: true }, { id: ray, name: 'Ray', active: false }] }, owner);
  assert.equal(off.status, 400);
  assert.equal((await call('PUT', '/api/workers', { workers: [{ id: ali, name: 'Ali', active: true }, { id: ray, name: 'Ray K', active: true }] }, owner)).status, 200);
});

test('the farm keeps an owner who can sign in: an owner without a password does not count', async (t) => {
  const { db, call, ali, ray, owner } = await farm(t);
  await call('PUT', `/api/workers/${ali}/role`, { role: 'owner' }, owner); // Ali: owner, no password yet
  const names = () => db.loginNames().map((n) => n.id);
  const demote = await call('PUT', `/api/workers/${ray}/role`, { role: 'worker' }, owner);
  assert.deepEqual([demote.status, demote.body], [400, { error: 'The farm needs an owner', field: 'role' }]);
  const left = await call('PUT', '/api/workers', { workers: [{ id: ali, name: 'Ali', active: true }] }, owner);
  assert.deepEqual([left.status, left.body.field], [400, 'workers']);
  const off = await call('PUT', '/api/workers', { workers: [{ id: ali, name: 'Ali', active: true }, { id: ray, name: 'Ray', active: false }] }, owner);
  assert.deepEqual([off.status, off.body.field], [400, 'workers']);
  assert.deepEqual(names(), [ray]);
});

test('an owner who is inactive may be demoted', async (t) => {
  const { db, call, ali, ray, owner } = await farm(t);
  await call('PUT', `/api/workers/${ali}/role`, { role: 'owner' }, owner);
  await call('POST', `/api/workers/${ali}/secret`, { secret: 'tall cedar plum window' }, owner);
  db.setWorkers([{ id: ali, name: 'Ali', active: false }, { id: ray, name: 'Ray', active: true }]);
  assert.equal((await call('PUT', `/api/workers/${ali}/role`, { role: 'worker' }, owner)).status, 200);
});

test('a role change clears a lock', async (t) => {
  const { db, call, ali, owner } = await farm(t);
  db.setTries(ali, 0, Date.now() + 60_000);
  const r = await call('PUT', `/api/workers/${ali}/role`, { role: 'owner' }, owner);
  assert.equal(r.body.account.lockedUntil, null);
});

test('your own row: no Set password here; demoting or signing out yourself clears your cookie', async (t) => {
  const { call, ali, ray, owner } = await farm(t);
  assert.deepEqual((await call('POST', `/api/workers/${ray}/secret`, { secret: 'a brand new password' }, owner)).body,
    { error: 'Use Change password on Settings', field: 'secret' });
  await call('PUT', `/api/workers/${ali}/role`, { role: 'owner' }, owner);
  await call('POST', `/api/workers/${ali}/secret`, { secret: 'tall cedar plum window' }, owner); // a second usable owner
  const out = await call('POST', `/api/workers/${ray}/sign-out`, undefined, owner);
  assert.match(out.cookie, /^farm_session=;.*Max-Age=0/);
  const again = (await call('POST', '/api/login', { id: ray, secret: 'long enough password' })).cookie.split(';')[0];
  const demoted = await call('PUT', `/api/workers/${ray}/role`, { role: 'worker' }, again);
  assert.deepEqual([demoted.status, /Max-Age=0/.test(demoted.cookie)], [200, true]);
});

test('the secret and the role racing: a PIN is not written over a changed role', async (t) => {
  const { db, ali } = await farm(t);
  const checkedRole = db.account(ali).role; // the route's check
  db.setRole(ali, 'owner'); // the role changes while the hash is slow
  assert.equal(db.setSecret(ali, 'pin-hash', checkedRole), false);
  assert.equal(db.account(ali).secretHash, null);
});

test('a worker gets 403 on the owner\'s tools; a wrong method gets 404', async (t) => {
  const { call, ali, ray, owner, signIn } = await farm(t);
  await call('POST', `/api/workers/${ali}/secret`, { secret: '482913' }, owner);
  const worker = await signIn(ali, '482913');
  assert.equal((await call('GET', '/api/workers/accounts', undefined, worker)).status, 403);
  assert.equal((await call('POST', `/api/workers/${ali}/secret`, { secret: '591347' }, worker)).status, 403);
  assert.equal((await call('POST', '/api/workers/accounts', undefined, owner)).status, 404);
  assert.equal((await call('GET', `/api/workers/${ray}/unlock`, undefined, owner)).status, 404);
  assert.equal((await call('POST', `/api/workers/${ray}/role`, { role: 'worker' }, owner)).status, 404);
});

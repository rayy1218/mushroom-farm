// createAuth (spec 2026-11-06-login-design.md 3): sign in with a PIN or a password, the account and address locks, the log,
// the session of a request and its sliding expiry, sign out, an owner's own password.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createAuth, hashSecret, tokenHash } from '../server/auth.js';

const T = Date.UTC(2026, 10, 6, 2); // 10:00 on the farm
const MIN = 60_000;
const tokenOf = (cookie) => /^farm_session=([^;]+)/.exec(cookie)[1];

async function setup(t) {
  const db = openDb(':memory:');
  db.setWorkers([{ name: 'Ali', active: true }, { name: 'Nopin', active: true }, { name: 'Gone', active: true }]);
  const id = (n) => db.listWorkers().find((w) => w.name === n).id;
  db.setSecret(id('Ali'), await hashSecret('482913'));
  db.setSecret(id('Gone'), await hashSecret('482913'));
  const ray = db.setOwner('Ray', await hashSecret('long enough password'));
  db.setWorkers(db.listWorkers().map((w) => ({ ...w, active: w.name !== 'Gone' })));
  let now = T;
  const lines = [];
  const auth = createAuth({ db, now: () => now, log: (line) => lines.push(line) });
  t.after(() => { auth.close(); db.close(); });
  const req = ({ address = '100.64.0.9', cookie } = {}) => ({
    socket: { remoteAddress: address }, headers: { 'user-agent': 'Test phone', ...(cookie ? { cookie } : {}) },
  });
  const res = () => { const headers = {}; return { headers, setHeader: (k, v) => { headers[k] = v; } }; };
  return { db, auth, ali: id('Ali'), nopin: id('Nopin'), gone: id('Gone'), ray, req, res, lines, at: (ms) => { now = ms; } };
}

test('the right PIN signs a worker in for 30 days: the reply, the cookie, the session (only the hash), the log', async (t) => {
  const { db, auth, ali, req, res, lines } = await setup(t);
  const r = await auth.login(req(), { id: ali, secret: '482913' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { id: ali, name: 'Ali', role: 'worker' });
  assert.match(r.cookie, /^farm_session=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=2592000$/);
  const s = db.session(tokenHash(tokenOf(r.cookie)));
  assert.deepEqual([s.workerId, s.expiresAt], [ali, T + 30 * 86_400_000]);
  assert.deepEqual(auth.who(req({ cookie: `farm_session=${tokenOf(r.cookie)}` }), res()), { id: ali, name: 'Ali', role: 'worker', sessionId: s.id });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^login 2026-11-06T02:00:00\.000Z 100\.64\.0\.9 worker \d+ right$/);
  assert.ok(!lines[0].includes('482913'));
});

test("the right password signs an owner in for 7 days", async (t) => {
  const { auth, ray, req } = await setup(t);
  const r = await auth.login(req(), { id: ray, secret: 'long enough password' });
  assert.deepEqual([r.status, r.body.role], [200, 'owner']);
  assert.match(r.cookie, /Max-Age=604800$/);
});

test('wrong, unknown, no secret, inactive: 401 with the same words, no session', async (t) => {
  const { db, auth, ali, nopin, gone, ray, req } = await setup(t);
  const pinWrong = { status: 401, body: { error: 'That PIN is not right', field: 'secret' } };
  assert.deepEqual(await auth.login(req(), { id: ali, secret: '111112' }), pinWrong);
  assert.deepEqual(await auth.login(req(), { id: 9999, secret: '482913' }), pinWrong);
  assert.deepEqual(await auth.login(req(), { id: nopin, secret: '482913' }), pinWrong);
  assert.deepEqual(await auth.login(req(), { id: gone, secret: '482913' }), pinWrong);
  assert.deepEqual(await auth.login(req(), { id: 'x', secret: 1 }), pinWrong);
  assert.deepEqual(await auth.login(req(), null), pinWrong);
  assert.deepEqual(await auth.login(req(), { id: ray, secret: 'not the password' }), { status: 401, body: { error: 'That password is not right', field: 'secret' } });
  assert.deepEqual(db.accounts(T).map((a) => a.sessions), [0, 0, 0, 0]);
});

test('5 wrong tries in a row lock the account 15 minutes (429 with the time); then the right PIN works and the count starts again', async (t) => {
  const { db, auth, ali, req, at } = await setup(t);
  for (let i = 0; i < 4; i++) assert.equal((await auth.login(req(), { id: ali, secret: '111112' })).status, 401);
  const locked = { status: 429, body: { error: 'Too many tries. Try again at 10:15' } };
  assert.deepEqual(await auth.login(req(), { id: ali, secret: '111112' }), locked);
  assert.deepEqual(await auth.login(req(), { id: ali, secret: '482913' }), locked, 'the right PIN waits too');
  at(T + 15 * MIN);
  assert.equal((await auth.login(req(), { id: ali, secret: '482913' })).status, 200);
  assert.deepEqual([db.account(ali).failedTries, db.account(ali).lockedUntil], [0, null]);
});

test('a right PIN between wrong ones starts the count again', async (t) => {
  const { db, auth, ali, req } = await setup(t);
  for (let i = 0; i < 4; i++) await auth.login(req(), { id: ali, secret: '111112' });
  assert.equal((await auth.login(req(), { id: ali, secret: '482913' })).status, 200);
  assert.equal(db.account(ali).failedTries, 0);
});

test('20 tries in 15 minutes from one address; the 21st is refused, another address is not', async (t) => {
  const { auth, ali, req, at } = await setup(t);
  for (let i = 0; i < 20; i++) assert.equal((await auth.login(req(), { id: 9999, secret: '000001' })).status, 401, `try ${i + 1}`);
  const limited = { status: 429, body: { error: 'Too many tries from here. Try again in 15 minutes' } };
  assert.deepEqual(await auth.login(req(), { id: ali, secret: '482913' }), limited);
  assert.equal((await auth.login(req({ address: '100.64.0.10' }), { id: ali, secret: '482913' })).status, 200);
  at(T + 15 * MIN);
  assert.equal((await auth.login(req(), { id: ali, secret: '482913' })).status, 200);
});

test('who: no cookie, an unknown token, an expired session or an inactive worker is nobody; the expiry slides once an hour', async (t) => {
  const { db, auth, ali, req, res, at } = await setup(t);
  const cookie = `farm_session=${tokenOf((await auth.login(req(), { id: ali, secret: '482913' })).cookie)}`;
  assert.equal(auth.who(req(), res()), null);
  assert.equal(auth.who(req({ cookie: 'farm_session=nope' }), res()), null);
  at(T + 59 * MIN);
  const quiet = res();
  assert.equal(auth.who(req({ cookie }), quiet).name, 'Ali');
  assert.deepEqual(quiet.headers, {}, 'not touched within the hour');
  at(T + 60 * MIN);
  const touched = res();
  auth.who(req({ cookie }), touched);
  assert.match(touched.headers['set-cookie'], /Max-Age=2592000$/);
  const id = auth.who(req({ cookie }), res()).sessionId;
  assert.equal(db.session(tokenHash(cookie.slice(13))).expiresAt, T + 60 * MIN + 30 * 86_400_000);
  at(T + 60 * MIN + 30 * 86_400_000);
  assert.equal(auth.who(req({ cookie }), res()), null);
  assert.equal(db.session(tokenHash(cookie.slice(13))), null, 'the expired session is deleted');
  assert.ok(id > 0);
  at(T);
  const again = `farm_session=${tokenOf((await auth.login(req(), { id: ali, secret: '482913' })).cookie)}`;
  db.setWorkers(db.listWorkers().map((w) => ({ ...w, active: w.name !== 'Ali' })));
  assert.equal(auth.who(req({ cookie: again }), res()), null);
});

test('logout ends only this session', async (t) => {
  const { auth, ali, req, res } = await setup(t);
  const one = `farm_session=${tokenOf((await auth.login(req(), { id: ali, secret: '482913' })).cookie)}`;
  const two = `farm_session=${tokenOf((await auth.login(req(), { id: ali, secret: '482913' })).cookie)}`;
  auth.logout(req({ cookie: one }));
  assert.equal(auth.who(req({ cookie: one }), res()), null);
  assert.equal(auth.who(req({ cookie: two }), res()).name, 'Ali');
  auth.logout(req()); // no cookie: nothing to end
});

test("an owner's own password: the current one needed; the next one checked; other browsers signed out, this one kept", async (t) => {
  const { auth, ray, req, res } = await setup(t);
  const here = `farm_session=${tokenOf((await auth.login(req(), { id: ray, secret: 'long enough password' })).cookie)}`;
  const there = `farm_session=${tokenOf((await auth.login(req(), { id: ray, secret: 'long enough password' })).cookie)}`;
  const me = auth.who(req({ cookie: here }), res());
  assert.deepEqual(await auth.changePassword(req(), me, { current: 'wrong', next: 'a brand new password' }),
    { status: 400, body: { error: 'That password is not right', field: 'current' } });
  assert.deepEqual(await auth.changePassword(req(), me, { current: 'long enough password', next: 'short' }),
    { status: 400, body: { error: 'The password must be at least 12 characters', field: 'next' } });
  const r = await auth.changePassword(req(), me, { current: 'long enough password', next: 'a brand new password' });
  assert.equal(r.status, 204);
  assert.match(r.cookie, /Max-Age=604800$/);
  assert.equal(auth.who(req({ cookie: there }), res()), null);
  assert.equal(auth.who(req({ cookie: here }), res()), null, 'the old token of this browser ended too; the new cookie replaces it');
  assert.equal(auth.who(req({ cookie: `farm_session=${tokenOf(r.cookie)}` }), res()).name, 'Ray');
  assert.equal((await auth.login(req(), { id: ray, secret: 'a brand new password' })).status, 200);
});

test('prune: expired sessions and old address counts go', async (t) => {
  const { db, auth, ali, req, at } = await setup(t);
  await auth.login(req(), { id: ali, secret: '482913' });
  at(T + 31 * 86_400_000);
  auth.prune();
  assert.equal(db.accounts(T).find((a) => a.id === ali).sessions, 0);
});

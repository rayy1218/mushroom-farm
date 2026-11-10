// createAuth (spec 2026-11-06-login-design.md 3): sign in with a PIN or a password, the locks (an account's for one address,
// a worker's daily cap, an address's limit), the owner's Telegram note, the log, the session of a request and its sliding
// expiry, sign out, an owner's own password.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createAuth, hashSecret, checkSecret, tokenHash, addressKey, LOCKED_UNTIL_UNLOCKED } from '../server/auth.js';

const T = Date.UTC(2026, 10, 6, 2); // 10:00 on the farm
const MIN = 60_000;
const tokenOf = (cookie) => /^farm_session=([^;]+)/.exec(cookie)[1];

async function setup(t, { check, notify } = {}) {
  const db = openDb(':memory:');
  db.setWorkers([{ name: 'Ali', active: true }, { name: 'Nopin', active: true }, { name: 'Gone', active: true }]);
  const id = (n) => db.listWorkers().find((w) => w.name === n).id;
  db.setSecret(id('Ali'), await hashSecret('482913'));
  db.setSecret(id('Gone'), await hashSecret('482913'));
  const ray = db.setOwner('Ray', await hashSecret('long enough password'));
  db.setWorkers(db.listWorkers().map((w) => ({ ...w, active: w.name !== 'Gone' })));
  let now = T;
  const lines = [];
  const notes = [];
  const auth = createAuth({ db, now: () => now, log: (line) => lines.push(line), notify: notify ?? ((text) => { notes.push(text); }), ...(check ? { check } : {}) });
  t.after(() => { auth.close(); db.close(); });
  const req = ({ address = '100.64.0.9', cookie } = {}) => ({
    socket: { remoteAddress: address }, headers: { 'user-agent': 'Test phone', ...(cookie ? { cookie } : {}) },
  });
  const res = () => { const headers = {}; return { headers, setHeader: (k, v) => { headers[k] = v; } }; };
  return { db, auth, ali: id('Ali'), nopin: id('Nopin'), gone: id('Gone'), ray, req, res, lines, notes, at: (ms) => { now = ms; } };
}

test('the right PIN signs a worker in for 30 days: the reply, the cookie, the session (only the hash), the log', async (t) => {
  const { db, auth, ali, req, res, lines } = await setup(t);
  const r = await auth.login(req(), { id: ali, secret: '482913' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { id: ali, name: 'Ali', role: 'worker' });
  // (from a tailnet address: plain http straight to the app, so no Secure; through the https proxy it has it, below)
  assert.match(r.cookie, /^farm_session=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000$/);
  const s = db.session(tokenHash(tokenOf(r.cookie)));
  assert.deepEqual([s.workerId, s.expiresAt], [ali, T + 30 * 86_400_000]);
  assert.deepEqual(auth.who(req({ cookie: `farm_session=${tokenOf(r.cookie)}` }), res()), { id: ali, name: 'Ali', role: 'worker', sessionId: s.id });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^login 2026-11-06T02:00:00\.000Z 100\.64\.0\.9 worker \d+ right$/);
  assert.ok(!lines[0].includes('482913'));
});

test("through Tailscale's https proxy (from this machine) the cookie is Secure; straight to the tailnet IP it is not", async (t) => {
  const { auth, ali, req } = await setup(t);
  assert.match((await auth.login(req({ address: '127.0.0.1' }), { id: ali, secret: '482913' })).cookie, /; HttpOnly; Secure; SameSite=Strict;/);
  assert.match((await auth.login(req({ address: '100.64.0.9' }), { id: ali, secret: '482913' })).cookie, /; HttpOnly; SameSite=Strict;/);
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

const WRONG = { id: 0, secret: '111112' };
const PIN_WRONG = { status: 401, body: { error: 'That PIN is not right', field: 'secret' } };
const LOCKED_TODAY = { status: 429, body: { error: 'Locked: ask the owner to unlock you' } };
const from = (address) => ({ address });

test('5 wrong tries in a row from one address lock the account for that address 15 minutes; another address still signs in', async (t) => {
  const { db, auth, ali, req, at } = await setup(t);
  const a = from('100.64.0.9');
  for (let i = 0; i < 4; i++) assert.deepEqual(await auth.login(req(a), { ...WRONG, id: ali }), PIN_WRONG);
  const locked = { status: 429, body: { error: 'Too many tries. Try again at 10:15' } };
  assert.deepEqual(await auth.login(req(a), { ...WRONG, id: ali }), locked);
  assert.deepEqual(await auth.login(req(a), { id: ali, secret: '482913' }), locked, 'the right PIN from there waits too');
  assert.deepEqual([db.account(ali).failedTries, db.account(ali).lockedUntil], [0, null], 'nothing stored: the account is not locked');
  assert.equal((await auth.login(req(from('100.64.0.10')), { id: ali, secret: '482913' })).status, 200, 'another address signs in');
  at(T + 15 * MIN);
  assert.equal((await auth.login(req(a), { id: ali, secret: '482913' })).status, 200);
});

test("an address's lock is the account's only: the same address may still sign in to another account", async (t) => {
  const { auth, ali, ray, req } = await setup(t);
  for (let i = 0; i < 5; i++) await auth.login(req(), { ...WRONG, id: ali });
  assert.equal((await auth.login(req(), { id: ali, secret: '482913' })).status, 429);
  assert.equal((await auth.login(req(), { id: ray, secret: 'long enough password' })).status, 200);
});

test('a right PIN between wrong ones from that address starts its count again', async (t) => {
  const { auth, ali, req } = await setup(t);
  for (let i = 0; i < 4; i++) await auth.login(req(), { ...WRONG, id: ali });
  assert.equal((await auth.login(req(), { id: ali, secret: '482913' })).status, 200);
  for (let i = 0; i < 4; i++) assert.deepEqual(await auth.login(req(), { ...WRONG, id: ali }), PIN_WRONG, `try ${i + 1} after`);
  assert.equal((await auth.login(req(), { ...WRONG, id: ali })).status, 429);
});

test("a right PIN from another address does not start this address's count again", async (t) => {
  const { auth, ali, req } = await setup(t);
  for (let i = 0; i < 4; i++) await auth.login(req(), { ...WRONG, id: ali });
  assert.equal((await auth.login(req(from('100.64.0.10')), { id: ali, secret: '482913' })).status, 200);
  assert.equal((await auth.login(req(), { ...WRONG, id: ali })).status, 429);
});

test("a worker's daily cap: 20 wrong tries in 24 hours over any addresses lock the account until the owner unlocks it", async (t) => {
  const { db, auth, ali, req, at, notes } = await setup(t);
  const rs = [];
  for (let n = 0; n < 5; n++) for (let i = 0; i < 4; i++) rs.push(await auth.login(req(from(`100.64.3.${n}`)), { ...WRONG, id: ali }));
  assert.deepEqual(rs.slice(0, 19).map((r) => r.status), Array(19).fill(401));
  assert.deepEqual(rs[19], LOCKED_TODAY, 'the 20th');
  assert.deepEqual([db.account(ali).failedTries, db.account(ali).lockedUntil], [0, LOCKED_UNTIL_UNLOCKED]);
  assert.deepEqual(notes, ['🔒 Sign-in: Ali locked after 20 wrong tries today; unlock in Settings → Workers']);
  assert.deepEqual(await auth.login(req(from('100.64.4.1')), { id: ali, secret: '482913' }), LOCKED_TODAY, 'the right PIN too');
  at(T + 3 * 86_400_000);
  assert.deepEqual(await auth.login(req(from('100.64.4.2')), { id: ali, secret: '482913' }), LOCKED_TODAY, 'days later too');
  db.setTries(ali, 0, null); // the owner's Unlock (accounts-api.js) …
  auth.unlocked(ali); // … and its hook
  assert.deepEqual(await auth.login(req(from('100.64.3.0')), { ...WRONG, id: ali }), PIN_WRONG, 'the counts start again');
  assert.equal((await auth.login(req(from('100.64.3.0')), { id: ali, secret: '482913' })).status, 200);
  assert.equal(notes.length, 1);
});

test("the daily cap's 24 hours: 19 wrong, a day later 19 more, and the account is not locked", async (t) => {
  const { db, auth, ali, req, at } = await setup(t);
  // 4 from each address at most, so no address locks
  for (let i = 0; i < 19; i++) assert.equal((await auth.login(req(from(`100.64.5.${Math.floor(i / 4)}`)), { ...WRONG, id: ali })).status, 401);
  at(T + 24 * 60 * MIN);
  for (let i = 0; i < 19; i++) assert.equal((await auth.login(req(from(`100.64.6.${Math.floor(i / 4)}`)), { ...WRONG, id: ali })).status, 401);
  assert.equal(db.account(ali).lockedUntil, null);
});

test('owners have no daily cap (a stranger could lock them out with it): only the per-address lock', async (t) => {
  const { db, auth, ray, req, notes } = await setup(t);
  const pwWrong = { status: 401, body: { error: 'That password is not right', field: 'secret' } };
  for (let n = 0; n < 10; n++) for (let i = 0; i < 4; i++) assert.deepEqual(await auth.login(req(from(`100.64.7.${n}`)), { id: ray, secret: 'not the password' }), pwWrong);
  assert.equal(db.account(ray).lockedUntil, null);
  assert.equal((await auth.login(req(from('100.64.8.1')), { id: ray, secret: 'long enough password' })).status, 200);
  assert.deepEqual(notes, []);
});

test('tries in flight together each count: 6 wrong at once from one address lock it, the right PIN from there then waits', async (t) => {
  const { auth, ali, req } = await setup(t);
  const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => auth.login(req(), { ...WRONG, id: ali })));
  assert.deepEqual(rs.map((r) => r.status).sort(), [401, 401, 401, 401, 429, 429]);
  assert.equal((await auth.login(req(), { id: ali, secret: '482913' })).status, 429);
  assert.equal((await auth.login(req(from('100.64.1.9')), { id: ali, secret: '482913' })).status, 200);
});

test("the owner's Telegram note when an address locks an account: once an hour per account at most", async (t) => {
  const { auth, ali, ray, req, at, notes } = await setup(t);
  for (let i = 0; i < 5; i++) await auth.login(req(from('100.64.9.1')), { ...WRONG, id: ali });
  assert.deepEqual(notes, ['🔒 Sign-in: 5 wrong tries for Ali from 100.64.9.1; locked for that address until 10:15']);
  at(T + 20 * MIN);
  for (let i = 0; i < 5; i++) await auth.login(req(from('100.64.9.2')), { ...WRONG, id: ali });
  assert.equal(notes.length, 1, 'within the hour: no second note for Ali');
  for (let i = 0; i < 5; i++) await auth.login(req(from('100.64.9.2')), { id: ray, secret: 'not the password' });
  assert.equal(notes.at(-1), '🔒 Sign-in: 5 wrong tries for Ray from 100.64.9.2; locked for that address until 10:35', "another account's own hour");
  at(T + 60 * MIN);
  for (let i = 0; i < 5; i++) await auth.login(req(from('100.64.9.3')), { ...WRONG, id: ali });
  assert.equal(notes.length, 3);
  assert.equal(notes.at(-1), '🔒 Sign-in: 5 wrong tries for Ali from 100.64.9.3; locked for that address until 11:15');
});

test('a note that fails (throws or rejects) is logged; the sign-in answers as ever', async (t) => {
  for (const notify of [() => { throw new Error('boom'); }, () => Promise.reject(new Error('boom'))]) {
    const { auth, ali, req, lines } = await setup(t, { notify });
    for (let i = 0; i < 4; i++) await auth.login(req(), { ...WRONG, id: ali });
    assert.equal((await auth.login(req(), { ...WRONG, id: ali })).status, 429);
    await new Promise((r) => setImmediate(r));
    assert.ok(lines.some((line) => line === 'login note failed: boom'), lines.join('\n'));
  }
});

test('a sign-in in flight when the PIN changes: the same 401 as a wrong PIN, no session, not counted as a wrong try', async (t) => {
  let change = null;
  const check = async (secret, stored) => {
    const right = await checkSecret(secret, stored);
    if (change) { const c = change; change = null; await c(); }
    return right;
  };
  const { db, auth, ali, req, lines } = await setup(t, { check });
  change = async () => db.setSecret(ali, await hashSecret('593024'));
  assert.deepEqual(await auth.login(req(), { id: ali, secret: '482913' }), PIN_WRONG);
  assert.equal(db.accounts(T).find((a) => a.id === ali).sessions, 0);
  assert.match(lines.at(-1), / changed$/);
  for (let i = 0; i < 4; i++) assert.deepEqual(await auth.login(req(), { ...WRONG, id: ali }), PIN_WRONG, `wrong ${i + 1}: the changed one did not count`);
  change = async () => db.setWorkers(db.listWorkers().map((w) => ({ ...w, active: w.name !== 'Ali' })));
  assert.deepEqual(await auth.login(req(from('100.64.0.10')), { id: ali, secret: '593024' }), PIN_WRONG, 'made inactive meanwhile');
  db.setWorkers(db.listWorkers().map((w) => ({ ...w, active: w.name !== 'Gone' })));
  change = async () => db.setRole(ali, 'owner');
  assert.deepEqual(await auth.login(req(from('100.64.0.10')), { id: ali, secret: '593024' }), PIN_WRONG, 'made an owner meanwhile');
  assert.equal(db.accounts(T).find((a) => a.id === ali).sessions, 0);
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

test('addressKey: an IPv6 address counts by its /64, an IPv4-mapped one as its IPv4', () => {
  assert.equal(addressKey('2001:db8:1:2:3:4:5:6'), addressKey('2001:db8:1:2::9'));
  assert.notEqual(addressKey('2001:db8:1:2::9'), addressKey('2001:db8:1:3::9'));
  assert.equal(addressKey('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(addressKey('100.64.0.9'), '100.64.0.9');
});

test('17 sign-ins at once: the 17th is told the app is busy', async (t) => {
  const { auth, req } = await setup(t);
  const rs = await Promise.all(Array.from({ length: 17 }, (_, i) => auth.login(req({ address: `100.64.2.${i}` }), { id: 9999, secret: '000001' })));
  assert.deepEqual(rs.map((r) => r.status).filter((s) => s === 503), [503]);
  assert.deepEqual(rs.find((r) => r.status === 503).body, { error: 'The farm app is busy. Try again in a moment' });
});

test('an owner-only password change; a long secret is just wrong; log results', async (t) => {
  const { auth, ali, req, res, lines } = await setup(t);
  const cookie = `farm_session=${tokenOf((await auth.login(req(), { id: ali, secret: '482913' })).cookie)}`;
  const me = auth.who(req({ cookie }), res());
  assert.deepEqual(await auth.changePassword(req(), me, { current: 'x', next: 'a brand new password' }), { status: 403, body: { error: 'Ask the owner' } });
  assert.equal((await auth.login(req(), { id: ali, secret: 'x'.repeat(2000) })).status, 401);
  assert.match(lines.at(-1), / wrong$/);
  await auth.login(req(), { id: 9999, secret: '000001' });
  assert.match(lines.at(-1), / unknown$/);
});

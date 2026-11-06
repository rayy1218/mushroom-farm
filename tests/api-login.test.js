// The gate over HTTP (spec 2026-11-06-login-design.md 3, 4 and 7): 401 without a session, the sign-in routes, the cookie,
// a worker's 403 on every route off the allow-list, a worker recorded as themselves, their own undo only, no money for a worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { hashSecret } from '../server/auth.js';
import { MONEY_KEYS } from '../server/roles.js';
import { localDate } from '../server/task-rules.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

async function farm(t) {
  const db = openDb(':memory:');
  const now = Date.now();
  const server = createApp(db, { tasks: createTasks({ db, now: () => now }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, cookie) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* a page or a CSV */ }
    return { status: res.status, body: parsed, cookie: res.headers.get('set-cookie') };
  };
  db.setWorkers([{ name: 'Ali', active: true }]);
  const ali = db.listWorkers()[0].id;
  db.setSecret(ali, await hashSecret('482913'));
  const ray = db.setOwner('Ray', await hashSecret('long enough password'));
  const signIn = async (id, secret) => /^farm_session=[^;]+/.exec((await call('POST', '/api/login', { id, secret })).cookie)[0];
  return { db, call, now, ali, ray, owner: await signIn(ray, 'long enough password'), worker: await signIn(ali, '482913') };
}

// Every route the API answers, a sample path each, and whether a worker may use it.
const ROUTES = [
  ['GET', '/api/settings', true], ['PUT', '/api/settings', false], ['POST', '/api/settings/telegram/test', false],
  ['GET', '/api/outdoor', true], ['GET', '/api/outdoor/history', true], ['GET', '/api/usage', false], ['GET', '/api/overview', true],
  ['GET', '/api/rooms', true], ['POST', '/api/rooms', false], ['GET', '/api/rooms/1', true], ['PUT', '/api/rooms/1', false],
  ['DELETE', '/api/rooms/1', false], ['GET', '/api/rooms/1/sensors', true], ['GET', '/api/rooms/1/usage', false],
  ['GET', '/api/rooms/1/control', false], ['PUT', '/api/rooms/1/control', false], ['GET', '/api/rooms/1/crop', true],
  ['PUT', '/api/rooms/1/crop', false], ['GET', '/api/rooms/1/history', true], ['GET', '/api/rooms/1/machines', true],
  ['PUT', '/api/rooms/1/machines/ac', false], ['GET', '/api/alarms', true], ['PUT', '/api/alarms/1', false],
  ['GET', '/api/rooms/1/tasks', true], ['POST', '/api/rooms/1/tasks', false], ['GET', '/api/rooms/1/tasks/log', true],
  ['GET', '/api/rooms/1/tasks/log.csv', false], ['GET', '/api/tasks/today', true], ['POST', '/api/tasks/1/done', true],
  ['POST', '/api/tasks/1/skip', true], ['POST', '/api/tasks/1/undo', true], ['POST', '/api/tasks/1/cancel', false],
  ['GET', '/api/workers', true], ['PUT', '/api/workers', false], ['GET', '/api/task-rules', false], ['PUT', '/api/task-rules', false],
  ['GET', '/api/calendar', true], ['GET', '/api/rooms/1/harvests', true], ['POST', '/api/rooms/1/harvests', true],
  ['PUT', '/api/harvests/1', false], ['DELETE', '/api/harvests/1', false], ['GET', '/api/harvest', true], ['GET', '/api/harvest.csv', false],
  ['GET', '/api/batches', false], ['POST', '/api/batches', false], ['GET', '/api/batches.csv', false], ['GET', '/api/batch-recipes', false],
  ['GET', '/api/inventory', true], ['POST', '/api/inventory/items', false], ['GET', '/api/inventory/items/1', true],
  ['PUT', '/api/inventory/items/1', false], ['GET', '/api/inventory/purchases', false], ['POST', '/api/inventory/purchases', false],
  ['POST', '/api/inventory/uses', true], ['POST', '/api/inventory/counts', true], ['PUT', '/api/inventory/moves/1', false],
  ['POST', '/api/inventory/lots/1/throw-out', false], ['GET', '/api/inventory/sheet', false], ['GET', '/api/sales', false],
  ['GET', '/api/buyers', false], ['GET', '/api/costs', false], ['GET', '/api/costs/month', false], ['GET', '/api/costs/summary', false],
  ['GET', '/api/runs', false], ['GET', '/api/runs/1', false], ['GET', '/api/business/summary', false],
  ['GET', '/api/simulations/1', false], ['GET', '/api/sizing/1', false], ['GET', '/api/workers/accounts', false],
  ['POST', '/api/workers/1/secret', false], ['PUT', '/api/workers/1/role', false], ['POST', '/api/workers/1/unlock', false],
  ['POST', '/api/workers/1/sign-out', false],
];

test('without a session every /api route is 401 but the sign-in routes; the page files are open', async (t) => {
  const { call, ali, ray } = await farm(t);
  for (const [m, p] of [...ROUTES, ['GET', '/api/events'], ['GET', '/api/session']]) {
    assert.deepEqual(await call(m, p), { status: 401, body: { error: 'Sign in' }, cookie: null }, `${m} ${p}`);
  }
  assert.deepEqual((await call('GET', '/api/login/names')).body, { names: [{ id: ali, name: 'Ali', kind: 'pin' }, { id: ray, name: 'Ray', kind: 'password' }] });
  assert.equal((await call('GET', '/')).status, 200);
  assert.equal((await call('GET', '/boot.js')).status, 200);
});

test('sign in over HTTP: the cookie, who I am, sign out', async (t) => {
  const { call, ali } = await farm(t);
  const r = await call('POST', '/api/login', { id: ali, secret: '482913' });
  assert.equal(r.status, 200);
  assert.match(r.cookie, /^farm_session=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=2592000$/);
  const cookie = /^farm_session=[^;]+/.exec(r.cookie)[0];
  assert.deepEqual((await call('GET', '/api/session', undefined, cookie)).body, { id: ali, name: 'Ali', role: 'worker' });
  const out = await call('POST', '/api/logout', undefined, cookie);
  assert.equal(out.status, 204);
  assert.match(out.cookie, /^farm_session=; .*Max-Age=0$/);
  assert.equal((await call('GET', '/api/session', undefined, cookie)).status, 401);
  assert.deepEqual((await call('POST', '/api/login', { id: ali, secret: '111112' })).body, { error: 'That PIN is not right', field: 'secret' });
});

test('a worker: 403 on every route off the allow-list, never on one on it; an owner: never 401 or 403', async (t) => {
  const { call, worker, owner } = await farm(t);
  for (const [m, p, may] of ROUTES) {
    const r = await call(m, p, undefined, worker);
    if (may) assert.notEqual(r.status, 403, `${m} ${p}`);
    else assert.deepEqual([r.status, r.body], [403, { error: 'Ask the owner' }], `${m} ${p}`);
  }
  for (const [m, p] of ROUTES) assert.ok(![401, 403].includes((await call(m, p, undefined, owner)).status), `${m} ${p}`);
});

test('a worker is recorded as themselves: another name in the body is not used', async (t) => {
  const { call, owner, worker } = await farm(t);
  const room = (await call('POST', '/api/rooms', ROOM, owner)).body.id;
  await call('PUT', `/api/rooms/${room}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] }, owner);
  const picked = await call('POST', `/api/rooms/${room}/harvests`, { kg: 3.5, crop: 'oyster', worker: 'Ray' }, worker);
  assert.deepEqual([picked.status, picked.body.worker], [201, 'Ali']);
  const item = (await call('POST', '/api/inventory/items', { name: 'Bleach', kind: 'chemical', unit: 'L' }, owner)).body.id;
  await call('POST', '/api/inventory/purchases', { itemId: item, qty: 3, total: 30 }, owner);
  const used = await call('POST', '/api/inventory/uses', { itemId: item, qty: 1, worker: 'Ray' }, worker);
  assert.deepEqual([used.status, used.body.worker], [201, 'Ali']);
  const ownerPick = await call('POST', `/api/rooms/${room}/harvests`, { kg: 1, crop: 'oyster', worker: 'Ali' }, owner);
  assert.equal(ownerPick.body.worker, 'Ali', 'an owner may record for someone');
});

test('a worker undoes only their own Done or Skip', async (t) => {
  const { db, call, owner, worker, now } = await farm(t);
  const room = (await call('POST', '/api/rooms', ROOM, owner)).body.id;
  await call('PUT', `/api/rooms/${room}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] }, owner);
  db.setProgram(room, { ...db.getProgram(room), stageSince: now });
  const today = (await call('GET', `/api/rooms/${room}/tasks`, undefined, owner)).body.today;
  const [mine, theirs] = today.filter((x) => x.ruleKey === 'footbath' || x.ruleKey === 'floorClean');
  assert.equal((await call('POST', `/api/tasks/${theirs.id}/done`, { worker: 'Ray' }, owner)).status, 200);
  assert.deepEqual(await call('POST', `/api/tasks/${theirs.id}/undo`, undefined, worker), { status: 403, body: { error: 'Ask the owner' }, cookie: null });
  assert.equal((await call('POST', `/api/tasks/${mine.id}/done`, {}, worker)).body.worker, 'Ali');
  assert.equal((await call('POST', `/api/tasks/${mine.id}/undo`, undefined, worker)).status, 200);
});

const moneyIn = (v, path = '') => (Array.isArray(v) ? v.flatMap((x, i) => moneyIn(x, `${path}[${i}]`))
  : v !== null && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [...(MONEY_KEYS.has(k) ? [`${path}.${k}`] : []), ...moneyIn(x, `${path}.${k}`)])
    : []);

test("a worker's replies carry no money; the owner's same replies do", async (t) => {
  const { call, owner, worker } = await farm(t);
  await call('PUT', '/api/settings', { cropYield: { oyster: { dryKg: 1, priceKg: 10 } } }, owner);
  const room = (await call('POST', '/api/rooms', ROOM, owner)).body.id;
  await call('PUT', `/api/rooms/${room}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] }, owner);
  await call('POST', `/api/rooms/${room}/harvests`, { kg: 3.5, crop: 'oyster', worker: 'Ali' }, owner);
  const item = (await call('POST', '/api/inventory/items', { name: 'Bleach', kind: 'chemical', unit: 'L' }, owner)).body.id;
  await call('POST', '/api/inventory/purchases', { itemId: item, qty: 3, total: 30 }, owner);
  const day = localDate(Date.now());
  const paths = ['/api/overview', '/api/rooms', `/api/rooms/${room}`, `/api/rooms/${room}/harvests`, '/api/harvest?days=30', '/api/inventory',
    `/api/inventory/items/${item}`, `/api/rooms/${room}/tasks`, '/api/tasks/today', `/api/calendar?from=${day}&to=${day}`, '/api/workers'];
  for (const p of paths) {
    const r = await call('GET', p, undefined, worker);
    assert.equal(r.status, 200, p);
    assert.deepEqual(moneyIn(r.body), [], p);
  }
  assert.ok(moneyIn((await call('GET', `/api/rooms/${room}/harvests`, undefined, owner)).body).length > 0, 'the owner sees the value');
  assert.ok(moneyIn((await call('GET', `/api/inventory/items/${item}`, undefined, owner)).body).length > 0, 'the owner sees the total');
  assert.deepEqual(Object.keys((await call('GET', '/api/settings', undefined, worker)).body), ['pollSeconds']);
});

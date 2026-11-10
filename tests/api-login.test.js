// The gate over HTTP (spec 2026-11-06-login-design.md 3, 4 and 7): 401 without a session, the sign-in routes, the cookie,
// a worker's 403 on every route off the allow-list, a worker recorded as themselves, their own undo only, no money for a worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
  const call = async (method, path, body, cookie, extra = {}) => {
    const headers = { ...extra };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* a page or a CSV */ }
    return { status: res.status, body: parsed, cookie: res.headers.get('set-cookie'), headers: res.headers };
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
  ['PUT', '/api/rooms/1/machines/ac', false], ['GET', '/api/alarms', true], ['POST', '/api/alarms/1/ack', false],
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
  ['GET', '/api/rooms/1/alarms', true], ['POST', '/api/rooms/1/alarms/ack', false], ['POST', '/api/rooms/1/filter/changed', false],
  ['GET', '/api/rooms/1/filter/changes', true], ['POST', '/api/rooms/1/simulations', false], ['POST', '/api/rooms/1/sizing', false],
  ['GET', '/api/batches/stock-items', false], ['GET', '/api/batches/1', false], ['POST', '/api/batches/1/place', false],
  ['POST', '/api/batches/1/unplace', false], ['POST', '/api/batches/1/checks', false], ['POST', '/api/batches/1/loads', false],
  ['PUT', '/api/batch-checks/1', false], ['PUT', '/api/batch-loads/1', false], ['PUT', '/api/batch-recipes/1', false],
  ['GET', '/api/costs.csv', false], ['PUT', '/api/costs/1', false], ['POST', '/api/costs/1/change', false], ['POST', '/api/costs/1/stop', false],
  ['GET', '/api/sales/range', false], ['GET', '/api/sales/summary', false], ['GET', '/api/sales.csv', false],
  ['PUT', '/api/sales/deliveries/1', false], ['PUT', '/api/sales/deliveries/1/paid', false], ['PUT', '/api/buyers/1', false],
  ['GET', '/api/economics', false], ['PUT', '/api/economics/figures', false], ['DELETE', '/api/economics/figures', false], // ---- Economics ----
  ['POST', '/api/economics/work-out', false], // ---- Economics ----
];

// Every route the API answers, from the server sources (spec 7: a new route missing from ROUTES fails here): each
// `path === '/api/…'` (or !==) literal, each regex literal /^\/api…/ and each new RegExp(`^/api…`) of server/api.js and
// server/*-api.js (not auth-api.js: the sign-in routes are before the gate, tested on their own). A regex is expanded into
// every path it answers, an id group as 1 and a machine name as ac; a part this cannot expand fails the test. It matches
// paths, not methods: a new method on a path already in ROUTES passes it (and is still closed to workers, as the allow-list
// is per method). So the readers miss nothing, every '/api…' string and /^\/api regex in those files must be one they read,
// or one of LEFT_ALONE.
const SERVER = new URL('../server/', import.meta.url);
const ID_SOURCE = '[1-9][0-9]{0,14}';

function expand(source) {
  const s = source.replace(/^\^/, '').replace(/\$$/, '').replaceAll(ID_SOURCE, '1').replaceAll('[a-z]+', 'ac');
  let i = 0;
  const alternatives = () => {
    const out = [];
    let seq = [''];
    while (i < s.length && s[i] !== ')') {
      const c = s[i++];
      if (c === '\\') seq = seq.map((x) => x + s[i++]);
      else if (c === '|') { out.push(...seq); seq = ['']; } else if (c === '(') {
        if (s.startsWith('?:', i)) i += 2;
        let inner = alternatives();
        assert.equal(s[i++], ')', `${source}: an open group`);
        if (s[i] === '?') { i++; inner = ['', ...inner]; }
        seq = seq.flatMap((x) => inner.map((y) => x + y));
      } else if ('[]{}*+?.^$'.includes(c)) assert.fail(`${source}: cannot expand ${c} at ${i - 1}`);
      else seq = seq.map((x) => x + c);
    }
    return [...out, ...seq];
  };
  const paths = alternatives();
  assert.equal(i, s.length, `${source}: a stray )`);
  return paths;
}

// The '/api…' strings that name no route: inventory-api's early return for every path outside /api/inventory.
const LEFT_ALONE = [['inventory-api.js', "!path.startsWith('/api/inventory/')"]];

// → { paths: every route path, unread: each '/api…' string or /^\/api regex of those files that no reader took }.
function serverRoutes() {
  const names = readdirSync(SERVER).filter((n) => n === 'api.js' || (n.endsWith('-api.js') && n !== 'auth-api.js'));
  const paths = new Set();
  const unread = [];
  for (const name of names) {
    const text = readFileSync(new URL(name, SERVER), 'utf8');
    const read = []; // [start, end) of each place a reader took
    const take = (m) => { read.push([m.index, m.index + m[0].length]); return m; };
    for (const m of text.matchAll(/path [!=]== '(\/api\/[^']*)'/g)) paths.add(take(m)[1]);
    for (const m of text.matchAll(/\/(\^\\\/api(?:\\.|[^/\\\n])*)\//g)) for (const p of expand(take(m)[1])) paths.add(p);
    for (const m of text.matchAll(/new RegExp\(`(\^\/api[^`]*)`\)/g)) {
      const src = take(m)[1];
      const plain = src.replaceAll('${ID}', ID_SOURCE);
      assert.ok(!plain.includes('${'), `${name}: ${src} has a part this cannot read`);
      for (const p of expand(plain)) paths.add(p);
    }
    for (const [file, code] of LEFT_ALONE) {
      if (file !== name) continue;
      const at = text.indexOf(code);
      assert.ok(at >= 0, `${name}: ${code} is gone; take it out of LEFT_ALONE`);
      read.push([at, at + code.length]);
    }
    for (const m of text.matchAll(/(['"`])\^?\/api[^'"`\n]*\1|\/\^\\\/api/g)) {
      if (!read.some(([a, b]) => a <= m.index && m.index + m[0].length <= b)) unread.push(`${name}: ${m[0]}`);
    }
  }
  return { paths: [...paths], unread };
}

test('ROUTES has a row for every route the server sources answer, and no row for one they do not', () => {
  const { paths: routes, unread } = serverRoutes();
  assert.deepEqual(unread, [], "'/api…' strings or regexes the readers did not take: read them, or add them to LEFT_ALONE");
  assert.ok(routes.length > 80, `found only ${routes.length}`);
  for (const known of ['/api/settings', '/api/rooms/1/machines/ac', '/api/batches/1/loads', '/api/workers/1/sign-out', '/api/runs/1']) {
    assert.ok(routes.includes(known), `the reading missed ${known}`);
  }
  const rows = new Set(ROUTES.map(([, p]) => p.split('?')[0]));
  assert.deepEqual(routes.filter((p) => !rows.has(p)), [], 'routes with no ROUTES row');
  assert.deepEqual([...rows].filter((p) => !routes.includes(p)), [], 'ROUTES rows that name no route');
});

test('without a session every /api route is 401 but the sign-in routes; the page files are open', async (t) => {
  const { call, ali, ray } = await farm(t);
  for (const [m, p] of [...ROUTES, ['GET', '/api/events'], ['GET', '/api/session']]) {
    const { status, body, cookie } = await call(m, p);
    assert.deepEqual({ status, body, cookie }, { status: 401, body: { error: 'Sign in' }, cookie: null }, `${m} ${p}`);
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
  const undone = await call('POST', `/api/tasks/${theirs.id}/undo`, undefined, worker);
  assert.deepEqual([undone.status, undone.body, undone.cookie], [403, { error: 'Ask the owner' }, null]);
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
  assert.equal((await call('POST', `/api/rooms/${room}/filter/changed`, undefined, owner)).status, 200);
  const day = localDate(Date.now());
  const paths = ['/api/overview', '/api/rooms', `/api/rooms/${room}`, `/api/rooms/${room}/alarms`, `/api/rooms/${room}/filter/changes`, `/api/rooms/${room}/harvests`, '/api/harvest?days=30', '/api/inventory',
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

test("a worker's Done, Skip and count record them, whatever name the body gives", async (t) => {
  const { db, call, owner, worker, now } = await farm(t);
  const room = (await call('POST', '/api/rooms', ROOM, owner)).body.id;
  await call('PUT', `/api/rooms/${room}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] }, owner);
  db.setProgram(room, { ...db.getProgram(room), stageSince: now });
  const today = (await call('GET', `/api/rooms/${room}/tasks`, undefined, owner)).body.today;
  const [one, two] = today.filter((x) => x.ruleKey === 'footbath' || x.ruleKey === 'floorClean');
  const done = await call('POST', `/api/tasks/${one.id}/done`, { worker: 'Ray' }, worker);
  assert.deepEqual([done.status, done.body.worker], [200, 'Ali']);
  const skipped = await call('POST', `/api/tasks/${two.id}/skip`, { worker: 'Ray', reason: 'No water' }, worker);
  assert.deepEqual([skipped.status, skipped.body.worker], [200, 'Ali']);
  const item = (await call('POST', '/api/inventory/items', { name: 'Bleach', kind: 'chemical', unit: 'L' }, owner)).body.id;
  const counted = await call('POST', '/api/inventory/counts', { worker: 'Ray', counts: [{ itemId: item, qty: 2 }] }, worker);
  assert.equal(counted.status, 201);
  assert.deepEqual(counted.body.moves.map((m) => m.worker), ['Ali']);
});

test("a worker's undo of a task that is not done or skipped is the usual 409, not 403", async (t) => {
  const { db, call, owner, worker, now } = await farm(t);
  const room = (await call('POST', '/api/rooms', ROOM, owner)).body.id;
  await call('PUT', `/api/rooms/${room}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] }, owner);
  db.setProgram(room, { ...db.getProgram(room), stageSince: now });
  const open = (await call('GET', `/api/rooms/${room}/tasks`, undefined, owner)).body.today.find((x) => x.ruleKey === 'footbath');
  const r = await call('POST', `/api/tasks/${open.id}/undo`, undefined, worker);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /not done or skipped/);
});

test("a worker may not change a password: POST /api/session/password is 403", async (t) => {
  const { call, worker } = await farm(t);
  const r = await call('POST', '/api/session/password', { current: '482913', next: 'a long new password' }, worker);
  assert.deepEqual([r.status, r.body], [403, { error: 'Ask the owner' }]);
});

test("a cookie with no session: GET /api/session's 401 clears it; the gate's 401 leaves it; no cookie, no Set-Cookie", async (t) => {
  // Only the start-up check clears it: a request in flight with the old cookie whose 401 lands after a fresh sign-in would
  // otherwise delete the new cookie.
  const { call, worker } = await farm(t);
  assert.equal((await call('POST', '/api/logout', undefined, worker)).status, 204);
  for (const cookie of [worker, 'farm_session=never-was']) {
    const session = await call('GET', '/api/session', undefined, cookie);
    assert.equal(session.status, 401);
    assert.match(session.cookie ?? '', /^farm_session=; .*Max-Age=0$/);
    const gate = await call('GET', '/api/rooms', undefined, cookie);
    assert.deepEqual([gate.status, gate.cookie], [401, null]);
  }
  for (const path of ['/api/rooms', '/api/session']) assert.equal((await call('GET', path)).cookie, null, path);
});

test("a worker's undo of a cancelled long-term task is undo's own 409, not 403", async (t) => {
  const { call, owner, worker } = await farm(t);
  const room = (await call('POST', '/api/rooms', ROOM, owner)).body.id;
  const task = (await call('POST', `/api/rooms/${room}/tasks`, { text: 'Fix the door' }, owner)).body.rows[0];
  assert.equal((await call('POST', `/api/tasks/${task.id}/cancel`, { reason: 'Done already' }, owner)).status, 200);
  const r = await call('POST', `/api/tasks/${task.id}/undo`, undefined, worker);
  assert.deepEqual([r.status, r.body], [409, { error: 'Only a daily task can be undone' }]);
});

test('the server closes its sign-in timer on its own (closeAuth), before the database goes', async () => {
  const db = openDb(':memory:');
  const server = createApp(db);
  assert.equal(typeof server.closeAuth, 'function');
  server.closeAuth();
  db.close();
  server.close(); // the close hook again: no throw
  const bare = openDb(':memory:');
  const off = createApp(bare, { login: false });
  off.closeAuth(); // without sign-in: nothing to close
  bare.close();
});

// ---- Writes only from the app's own pages; the API's headers (security review M2, M4) ----

const ASK = { error: 'Ask from the farm app' };
const site = (value) => ({ 'sec-fetch-site': value });

test('a write whose Sec-Fetch-Site is not same-origin (or none) is 403, sign-in and sign-out too; same-origin, none or no header is as before', async (t) => {
  const { call, db, ali, owner } = await farm(t);
  for (const value of ['cross-site', 'same-site']) {
    const login = await call('POST', '/api/login', { id: ali, secret: '482913' }, undefined, site(value));
    assert.deepEqual([login.status, login.body, login.cookie], [403, ASK, null], value);
    const put = await call('PUT', '/api/settings', { gateway: 'x' }, owner, site(value));
    assert.deepEqual([put.status, put.body], [403, ASK], value);
    for (const [m, p] of [['POST', '/api/rooms'], ['DELETE', '/api/rooms/1'], ['POST', '/api/logout'], ['POST', '/api/workers/1/sign-out']]) {
      assert.deepEqual((await call(m, p, undefined, owner, site(value))).status, 403, `${value} ${m} ${p}`);
    }
    // a read is not a write: as before
    assert.equal((await call('GET', '/api/rooms', undefined, owner, site(value))).status, 200, value);
    assert.equal((await call('GET', '/api/login/names', undefined, undefined, site(value))).status, 200, value);
  }
  assert.equal((await call('GET', '/api/session', undefined, owner)).status, 200, 'the cross-site sign-out did not sign out');
  for (const extra of [site('same-origin'), site('none'), {}]) {
    assert.equal((await call('POST', '/api/login', { id: ali, secret: '482913' }, undefined, extra)).status, 200, JSON.stringify(extra));
    assert.equal((await call('POST', '/api/rooms', { ...ROOM, name: `Room ${db.listRooms().length + 1}` }, owner, extra)).status, 201, JSON.stringify(extra));
  }
});

test('every /api reply carries nosniff, DENY, no-referrer and no-store: a JSON reply, a 401, a 403 and the sign-in routes', async (t) => {
  const { call, owner, worker } = await farm(t);
  const replies = {
    json: await call('GET', '/api/rooms', undefined, owner),
    session: await call('GET', '/api/session', undefined, worker),
    signIn: await call('GET', '/api/login/names'),
    401: await call('GET', '/api/rooms'),
    403: await call('PUT', '/api/settings', {}, worker),
    'not the app': await call('POST', '/api/rooms', ROOM, owner, site('cross-site')),
    404: await call('GET', '/api/nothing-here', undefined, owner),
  };
  for (const [what, r] of Object.entries(replies)) {
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', what);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', what);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer', what);
    assert.equal(r.headers.get('cache-control'), 'no-store', what);
  }
  assert.deepEqual([replies[401].status, replies[403].status, replies['not the app'].status, replies[404].status], [401, 403, 403, 404]);
  assert.match(replies.json.headers.get('content-type'), /^application\/json/);
  // the page files keep their own caching
  assert.notEqual((await call('GET', '/')).headers.get('cache-control'), 'no-store');
});

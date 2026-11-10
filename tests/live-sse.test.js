// Live updates on the server (spec 2026-10-26-live-alarms-outdoor-design.md sections 2 and 3): the GET /api/events stream and
// the places that publish the change events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';
import { createMachines } from '../server/machines.js';
import { createController } from '../server/controller.js';
import { createSimulations } from '../server/simulations.js';
import { createLive, createSse, watchAlarms, alarmCount, MAX_BACKLOG, MAX_PER_SESSION, MAX_PER_PERSON, OWNER_RESERVE } from '../server/live.js';
import { hashSecret } from '../server/auth.js';

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };

async function start(t, { ssePingMs, wire } = {}) {
  const db = openDb(':memory:');
  const events = createEvents();
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller });
  const controller = createController({ db, machines });
  const extra = wire ? wire({ db, events }) : {};
  const server = createApp(db, { login: false, machines, controller, events, ssePingMs, ...extra });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  return { db, events, server, port, base: `http://127.0.0.1:${port}` };
}

// Opens the stream; read(n) → the text after n more chunks have arrived (or what there is after 2 s).
function stream(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ port, host: '127.0.0.1', path: '/api/events', headers }, (res) => {
      let text = '';
      const ended = new Promise((ok) => { res.on('end', ok); res.on('close', ok); });
      const waiting = [];
      res.setEncoding('utf8');
      res.on('data', (d) => {
        text += d;
        for (const w of [...waiting]) if (w.until(text)) { waiting.splice(waiting.indexOf(w), 1); w.resolve(text); }
      });
      resolve({
        res,
        req,
        ended,
        text: () => text,
        until: (re) => new Promise((ok, no) => {
          if (re.test(text)) return ok(text);
          const w = { until: (s) => re.test(s), resolve: ok };
          waiting.push(w);
          setTimeout(() => no(new Error(`no ${re} in ${JSON.stringify(text)}`)), 2000).unref();
        }),
      });
    });
    req.on('error', reject);
  });
}

test('the stream: headers, a hello first, then each event as it is published', async (t) => {
  const { events, port } = await start(t);
  const s = await stream(port);
  t.after(() => s.req.destroy());
  assert.equal(s.res.statusCode, 200);
  assert.match(s.res.headers['content-type'], /^text\/event-stream/);
  assert.equal(s.res.headers['cache-control'], 'no-cache');
  assert.equal(s.res.headers.connection, 'keep-alive');
  await s.until(/event: hello\ndata: \{"at":\d+\}\n\n/);
  events.publish('room', { id: 3, part: 'readings' });
  await s.until(/event: room\ndata: \{"id":3,"part":"readings"\}\n\n/);
  assert.ok(s.text().startsWith('event: hello'));
});

test('a ping comment every interval', async (t) => {
  const { port } = await start(t, { ssePingMs: 20 });
  const s = await stream(port);
  t.after(() => s.req.destroy());
  await s.until(/: ping\n\n[^]*: ping\n\n/);
});

test('the 21st stream gets 503, and a closed stream is forgotten at once', async (t) => {
  const { events, port, base } = await start(t);
  const streams = [];
  const others = events.listeners(); // the app's own subscriptions (Inventory listens for 'batches')
  for (let i = 0; i < 20; i++) streams.push(await stream(port));
  t.after(() => streams.forEach((s) => s.req.destroy()));
  assert.equal(events.listeners(), others + 20);
  const refused = await fetch(`${base}/api/events`);
  assert.equal(refused.status, 503);
  assert.deepEqual(await refused.json(), { error: 'Too many live connections' });
  streams[0].req.destroy();
  for (let i = 0; i < 50 && events.listeners() === others + 20; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(events.listeners(), others + 19);
  const again = await stream(port);
  t.after(() => again.req.destroy());
  assert.equal(again.res.statusCode, 200);
});

test('only GET; without a bus the route does not exist', async (t) => {
  const { base } = await start(t);
  assert.equal((await fetch(`${base}/api/events`, { method: 'POST' })).status, 404);
  const db = openDb(':memory:');
  const server = createApp(db, { login: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); db.close(); });
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/events`)).status, 404);
});

function collect(events) {
  const got = [];
  events.subscribe((type, data) => got.push([type, data]));
  return got;
}

async function put(base, path, body) {
  const res = await fetch(base + path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.status;
}

test('routes publish: a command (machines), control saved, crop saved, a filter change', async (t) => {
  const { db, events, base } = await start(t);
  const id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5, relayAddress: 3, acAddress: 4 }).id;
  const got = collect(events);
  assert.equal(await put(base, `/api/rooms/${id}/machines/intake`, { on: true }), 200);
  const control = await (await fetch(`${base}/api/rooms/${id}/control`)).json();
  assert.equal(await put(base, `/api/rooms/${id}/control`, { ...control, auto: false }), 200);
  assert.equal(await put(base, `/api/rooms/${id}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] }), 200);
  assert.equal((await fetch(`${base}/api/rooms/${id}/filter/changed`, { method: 'POST' })).status, 200);
  assert.deepEqual(got, [
    ['room', { id, part: 'machines' }], ['room', { id, part: 'control' }], ['room', { id, part: 'crop' }], ['room', { id, part: 'filter' }],
  ]);
  // a refused command publishes nothing
  got.length = 0;
  assert.equal(await put(base, `/api/rooms/${id}/machines/intake`, { on: 'yes' }), 400);
  assert.deepEqual(got, []);
});

test('an alarm raised, acknowledged and cleared publishes alarms with the count of unacknowledged active ones', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const events = createEvents();
  watchAlarms(db, events);
  const got = collect(events);
  const room = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
  const a = db.raiseAlarm(room, 'co2-high', 'critical', 'CO₂ high', 1000);
  db.raiseAlarm(room, 't-high', 'warning', 'Warm', 1000);
  db.ackAlarm(a, 2000);
  db.clearAlarm(room, 't-high', 3000);
  assert.deepEqual(got, [['alarms', { count: 1 }], ['alarms', { count: 2 }], ['alarms', { count: 1 }], ['alarms', { count: 0 }]]);
  assert.equal(alarmCount(db), 0);
});

test('a poll cycle publishes readings for the rooms with a device and outdoor when the probe is set; changes since the last cycle publish machines, control and crop', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const events = createEvents();
  const got = collect(events);
  const wired = db.createRoom({ name: 'Wired', length: 6, width: 4, height: 2.5, trhAddress: 1 }).id;
  const bare = db.createRoom({ name: 'Bare', length: 6, width: 4, height: 2.5 }).id;
  let machineView = { a: 1 };
  let controlView = { b: 1 };
  const live = createLive({
    db, events, machines: { get: () => machineView }, controller: { get: () => controlView },
  });
  live.afterCycle();
  assert.deepEqual(got, [['room', { id: wired, part: 'readings' }]], 'the first cycle only takes note');
  got.length = 0;
  machineView = { a: 2 };
  controlView = { b: 2 };
  live.afterCycle();
  assert.deepEqual(got.map(([, d]) => `${d.id}/${d.part}`), [`${bare}/machines`, `${bare}/control`, `${wired}/readings`, `${wired}/machines`, `${wired}/control`]);
  got.length = 0;
  live.afterCycle();
  assert.deepEqual(got.map(([, d]) => d.part), ['readings'], 'nothing changed: only the readings');
});

test('a failing view never breaks the cycle', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  db.createRoom({ name: 'R', length: 6, width: 4, height: 2.5 });
  const logged = [];
  const live = createLive({ db, events: createEvents(), machines: { get: () => { throw new Error('boom'); } }, log: (e) => logged.push(e.message) });
  live.afterCycle();
  assert.deepEqual(logged, ['boom']);
});

test('simulation and sizing jobs publish queued, running, progress and the end', (t) => {
  const jobs = [];
  const db = openDb(':memory:');
  t.after(() => db.close());
  const events = createEvents();
  const id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
  const got = collect(events);
  const simulations = createSimulations({ db, onChange: (type, data) => events.publish(type, data), spawn: (job, handlers) => { jobs.push(handlers); return { stop() {} }; } });
  t.after(() => simulations.close());
  const { run } = simulations.start(id, { physics, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1 });
  jobs[0].onProgress(0.5);
  jobs[0].onDone({ summary: { days: 1 }, series: [] });
  assert.deepEqual(got.map(([type, d]) => [type, d.status, d.progress]), [
    ['simulation', 'queued', 0], ['simulation', 'running', 0], ['simulation', 'running', 0.5], ['simulation', 'done', 1],
  ]);
  assert.equal(got[0][1].id, run.id);
  assert.equal(got[0][1].roomId, id);
  got.length = 0;
  const { job } = simulations.startSizing(id, { physics: { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300 }, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting' });
  jobs[1].onProgress(0.25);
  jobs[1].onDone({ plans: [] });
  assert.deepEqual(got.map(([type, d]) => [type, d.status]), [['sizing', 'queued'], ['sizing', 'running'], ['sizing', 'running'], ['sizing', 'done']]);
  assert.deepEqual(Object.keys(got[0][1]), ['id', 'roomId', 'status', 'progress', 'tried', 'total']);
  assert.equal(got[3][1].tried, job.total);
});

test('a room made, edited or deleted publishes room part room; a delete also the tasks due', async (t) => {
  const { events, base } = await start(t);
  const got = collect(events);
  const body = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
  const made = await (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  assert.equal(await put(base, `/api/rooms/${made.id}`, { ...body, length: 7 }), 200);
  assert.equal((await fetch(`${base}/api/rooms/${made.id}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual(got, [
    ['room', { id: made.id, part: 'room' }], ['room', { id: made.id, part: 'room' }], ['room', { id: made.id, part: 'room' }], ['tasks', { due: 0 }],
  ], 'a delete also gives the farm due count without the room');
});

test('a client that does not read is dropped once too much waits for it; a failing room does not hide the others', (t) => {
  const events = createEvents();
  const sse = createSse({ events });
  const res = {
    backlog: 0, destroyed: false, handlers: {},
    writeHead() {}, flushHeaders() {}, end() {},
    write(text) { this.backlog += text.length; },
    get writableLength() { return this.backlog; },
    destroy() { this.destroyed = true; },
    on(type, fn) { this.handlers[type] = fn; },
  };
  const req = { method: 'GET', socket: { setTimeout() {}, setNoDelay() {}, setKeepAlive(on, ms) { this.keep = [on, ms]; } } };
  sse.handler(req, res);
  t.after(() => res.handlers.close?.());
  assert.deepEqual(req.socket.keep, [true, 30_000]);
  assert.equal(res.destroyed, false);
  events.publish('room', { id: 1, part: 'x'.repeat(MAX_BACKLOG) });
  assert.equal(res.destroyed, true);

  const db = openDb(':memory:');
  t.after(() => db.close());
  db.createRoom({ name: 'A', length: 6, width: 4, height: 2.5, trhAddress: 1 });
  const b = db.createRoom({ name: 'B', length: 6, width: 4, height: 2.5, trhAddress: 2 }).id;
  const got = collect(events);
  const logged = [];
  const live = createLive({ db, events, machines: { get: (id) => { if (id !== b) throw new Error('boom'); return {}; } }, log: (e) => logged.push(e.message) });
  live.afterCycle();
  assert.deepEqual(got.map(([, d]) => d.id), [1, b], 'readings of both rooms');
  assert.deepEqual(logged, ['boom']);
});

// ---- The stream follows the session (security review I4) ----

// A farm with sign-in on: Ali (a worker) and Ray (the owner). signIn(id, secret) → a Cookie header.
async function signedIn(t, { ssePingMs = 30 } = {}) {
  const db = openDb(':memory:');
  const events = createEvents();
  const server = createApp(db, { events, ssePingMs, loginNotify: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  db.setWorkers([{ name: 'Ali', active: true }]);
  const ali = db.listWorkers()[0].id;
  db.setSecret(ali, await hashSecret('482913'));
  const ray = db.setOwner('Ray', await hashSecret('long enough password'));
  const signIn = async (id, secret) => {
    const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, secret }) });
    return /^farm_session=[^;]+/.exec(res.headers.get('set-cookie'))[0];
  };
  const post = (path, cookie) => fetch(base + path, { method: 'POST', headers: { cookie } });
  return { db, port, base, ali, ray, signIn, post };
}

const within = (promise, ms, what) => Promise.race([
  promise, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: not within ${ms} ms`)), ms).unref()),
]);
const still = async (s, ms) => assert.equal(await Promise.race([s.ended.then(() => 'ended'), new Promise((r) => setTimeout(() => r('open'), ms))]), 'open');

test('a signed-in stream ends at the next ping after its session ends (Sign out everywhere, Sign out); another session\'s stream goes on', async (t) => {
  const { ali, ray, signIn, post, port } = await signedIn(t);
  const owner = await signIn(ray, 'long enough password');
  const worker = await signIn(ali, '482913');
  const ownerStream = await stream(port, { cookie: owner });
  const workerStream = await stream(port, { cookie: worker });
  t.after(() => { ownerStream.req.destroy(); workerStream.req.destroy(); });
  assert.deepEqual([ownerStream.res.statusCode, workerStream.res.statusCode], [200, 200]);
  await workerStream.until(/: ping\n\n/); // open past a ping while the session lives
  assert.equal((await post(`/api/workers/${ali}/sign-out`, owner)).status, 200);
  await within(workerStream.ended, 500, 'the signed-out worker\'s stream');
  await still(ownerStream, 150);
  assert.equal((await post('/api/logout', owner)).status, 204);
  await within(ownerStream.ended, 500, 'the signed-out owner\'s stream');
});

test(`at most ${MAX_PER_SESSION} streams per sign-in: the next is 429; another sign-in still opens one; a closed one frees its place`, async (t) => {
  assert.equal(MAX_PER_SESSION, 3);
  const { ray, signIn, port, base } = await signedIn(t, { ssePingMs: 25_000 });
  const owner = await signIn(ray, 'long enough password');
  const streams = [];
  t.after(() => streams.forEach((s) => s.req.destroy()));
  for (let i = 0; i < 3; i++) streams.push(await stream(port, { cookie: owner }));
  assert.deepEqual(streams.map((s) => s.res.statusCode), [200, 200, 200]);
  const refused = await fetch(`${base}/api/events`, { headers: { cookie: owner } });
  assert.equal(refused.status, 429);
  assert.match(refused.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await refused.json(), { error: 'Too many live connections for this sign-in' });
  const other = await stream(port, { cookie: await signIn(ray, 'long enough password') });
  streams.push(other);
  assert.equal(other.res.statusCode, 200);
  streams[0].req.destroy();
  await streams[0].ended;
  let again;
  for (let i = 0; i < 50; i++) {
    again = await stream(port, { cookie: owner });
    streams.push(again);
    if (again.res.statusCode === 200) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(again.res.statusCode, 200);
});

test('without sign-in (login: false) a stream has no session check and no per-session limit', async (t) => {
  const { port } = await start(t, { ssePingMs: 20 });
  const streams = [];
  t.after(() => streams.forEach((s) => s.req.destroy()));
  for (let i = 0; i < MAX_PER_SESSION + 1; i++) streams.push(await stream(port));
  assert.ok(streams.every((s) => s.res.statusCode === 200));
  await streams[0].until(/: ping\n\n[^]*: ping\n\n/);
  await still(streams[0], 60);
});

test('createSse: check(req) is asked at every ping; false ends the stream (a sign-in ended: up to one ping late, 25 s live)', async (t) => {
  let alive = true;
  const asked = [];
  const sse = createSse({ events: createEvents(), pingMs: 20, check: (req) => { asked.push(req.url); return alive; } });
  const server = http.createServer((req, res) => sse.handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { sse.close(); server.closeAllConnections(); server.close(); });
  const s = await stream(server.address().port);
  await s.until(/: ping\n\n/);
  assert.ok(asked.length >= 1 && asked.every((u) => u === '/api/events'));
  alive = false;
  await within(s.ended, 500, 'the stream');
  assert.equal(sse.clients(), 0);
});

// A bare stream server whose req.who comes from the x-who header (as the gate would set it). → its port.
async function bare(t, options = {}) {
  const sse = createSse({ events: createEvents(), ...options });
  const server = http.createServer((req, res) => {
    if (req.headers['x-who']) req.who = JSON.parse(req.headers['x-who']);
    sse.handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { sse.close(); server.closeAllConnections(); server.close(); });
  return { port: server.address().port, sse };
}
const as = (id, role, sessionId) => ({ 'x-who': JSON.stringify({ id, role, sessionId, name: `P${id}` }) });
async function body(s) {
  await s.ended;
  return JSON.parse(s.text());
}

test(`one person stops at ${MAX_PER_PERSON} streams over several sign-ins: the next is 429 for this person`, async (t) => {
  assert.equal(MAX_PER_PERSON, 6);
  const { ali, signIn, port } = await signedIn(t, { ssePingMs: 25_000 });
  const cookies = [await signIn(ali, '482913'), await signIn(ali, '482913'), await signIn(ali, '482913')];
  const streams = [];
  t.after(() => streams.forEach((s) => s.req.destroy()));
  for (const cookie of cookies.slice(0, 2)) for (let i = 0; i < 3; i++) streams.push(await stream(port, { cookie }));
  assert.ok(streams.every((s) => s.res.statusCode === 200));
  const seventh = await stream(port, { cookie: cookies[2] });
  streams.push(seventh);
  assert.equal(seventh.res.statusCode, 429);
  assert.deepEqual(await body(seventh), { error: 'Too many live connections for this person' });
});

test(`workers cannot take the last ${OWNER_RESERVE} places; an owner can`, async (t) => {
  assert.equal(OWNER_RESERVE, 4);
  const { port } = await bare(t, { pingMs: 25_000 });
  const streams = [];
  t.after(() => streams.forEach((s) => s.req.destroy()));
  const open = async (headers) => { const s = await stream(port, headers); streams.push(s); return s; };
  // 16 worker streams: persons 1 and 2 six each (two sign-ins of 3), person 3 four
  let session = 0;
  for (const [person, count] of [[1, 6], [2, 6], [3, 4]]) {
    for (let i = 0; i < count; i++) {
      if (i % 3 === 0) session += 1;
      assert.equal((await open(as(person, 'worker', session))).res.statusCode, 200, `worker ${person} #${i + 1}`);
    }
  }
  const worker = await open(as(4, 'worker', 99));
  assert.equal(worker.res.statusCode, 503);
  assert.deepEqual(await body(worker), { error: 'Too many live connections' });
  for (let i = 0; i < 4; i++) assert.equal((await open(as(10, 'owner', 100 + Math.floor(i / 3)))).res.statusCode, 200, `owner #${i + 1}`);
  const full = await open(as(11, 'owner', 200));
  assert.equal(full.res.statusCode, 503);
});

test('429 for the sign-in or the person comes before the 503 of a full server', async (t) => {
  const { port } = await bare(t, { pingMs: 25_000, maxClients: 6 });
  const streams = [];
  t.after(() => streams.forEach((s) => s.req.destroy()));
  const open = async (headers) => { const s = await stream(port, headers); streams.push(s); return s; };
  for (let i = 0; i < 6; i++) assert.equal((await open(as(1, 'owner', i < 3 ? 1 : 2))).res.statusCode, 200);
  const sameSession = await open(as(1, 'owner', 1));
  assert.deepEqual([sameSession.res.statusCode, await body(sameSession)], [429, { error: 'Too many live connections for this sign-in' }]);
  const samePerson = await open(as(1, 'owner', 3));
  assert.deepEqual([samePerson.res.statusCode, await body(samePerson)], [429, { error: 'Too many live connections for this person' }]);
  assert.equal((await open(as(2, 'owner', 4))).res.statusCode, 503);
});

test('a sign-in at its 3 streams whose session ends frees their places: signed in again it opens 3 more', async (t) => {
  const { ali, ray, signIn, post, port } = await signedIn(t);
  const owner = await signIn(ray, 'long enough password');
  const first = await signIn(ali, '482913');
  const second = await signIn(ali, '482913');
  const streams = [];
  t.after(() => streams.forEach((s) => s.req.destroy()));
  for (const cookie of [first, second]) for (let i = 0; i < 3; i++) streams.push(await stream(port, { cookie }));
  assert.ok(streams.every((s) => s.res.statusCode === 200), 'Ali at the person cap');
  assert.equal((await post('/api/logout', first)).status, 204);
  await within(Promise.all(streams.slice(0, 3).map((s) => s.ended)), 500, 'the first sign-in\'s streams');
  await still(streams[3], 100);
  const again = await signIn(ali, '482913');
  for (let i = 0; i < 3; i++) {
    const s = await stream(port, { cookie: again });
    streams.push(s);
    assert.equal(s.res.statusCode, 200, `again #${i + 1}`);
  }
  assert.ok(owner);
});

test("an inactive worker's stream ends; so does one whose session's role changed (an owner made a worker)", async (t) => {
  const { db, ali, ray, signIn, port } = await signedIn(t);
  const owner = await signIn(ray, 'long enough password');
  const worker = await signIn(ali, '482913');
  const ownerStream = await stream(port, { cookie: owner });
  const workerStream = await stream(port, { cookie: worker });
  t.after(() => { ownerStream.req.destroy(); workerStream.req.destroy(); });
  // the session rows stay (the database's own changes end them too): only the account changed
  const session = db.session.bind(db);
  db.session = (hash) => {
    const s = session(hash);
    if (s?.workerId === ali) return { ...s, active: false };
    if (s?.workerId === ray) return { ...s, role: 'worker' };
    return s;
  };
  await within(workerStream.ended, 500, 'the inactive worker\'s stream');
  await within(ownerStream.ended, 500, 'the demoted owner\'s stream');
});

test('a worker made inactive in Settings: the stream ends', async (t) => {
  const { db, ali, signIn, port } = await signedIn(t);
  const s = await stream(port, { cookie: await signIn(ali, '482913') });
  t.after(() => s.req.destroy());
  await s.until(/: ping\n\n/);
  db.setWorkers(db.listWorkers().map((w) => (w.id === ali ? { ...w, active: false } : w)));
  await within(s.ended, 500, 'the stream');
});

test('a check that throws ends the stream, and is logged', async (t) => {
  const logged = [];
  const { port, sse } = await bare(t, { pingMs: 20, check: () => { throw new Error('db closed'); }, log: (err) => logged.push(err.message) });
  const s = await stream(port);
  await within(s.ended, 500, 'the stream');
  assert.deepEqual(logged, ['db closed']);
  assert.equal(sse.clients(), 0);
});

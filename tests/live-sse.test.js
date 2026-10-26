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
import { createLive, createSse, watchAlarms, alarmCount, MAX_BACKLOG } from '../server/live.js';

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };

async function start(t, { ssePingMs, wire } = {}) {
  const db = openDb(':memory:');
  const events = createEvents();
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller });
  const controller = createController({ db, machines });
  const extra = wire ? wire({ db, events }) : {};
  const server = createApp(db, { machines, controller, events, ssePingMs, ...extra });
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
function stream(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ port, host: '127.0.0.1', path: '/api/events' }, (res) => {
      let text = '';
      const waiting = [];
      res.setEncoding('utf8');
      res.on('data', (d) => {
        text += d;
        for (const w of [...waiting]) if (w.until(text)) { waiting.splice(waiting.indexOf(w), 1); w.resolve(text); }
      });
      resolve({
        res,
        req,
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
  for (let i = 0; i < 20; i++) streams.push(await stream(port));
  t.after(() => streams.forEach((s) => s.req.destroy()));
  assert.equal(events.listeners(), 20);
  const refused = await fetch(`${base}/api/events`);
  assert.equal(refused.status, 503);
  assert.deepEqual(await refused.json(), { error: 'Too many live connections' });
  streams[0].req.destroy();
  for (let i = 0; i < 50 && events.listeners() === 20; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(events.listeners(), 19);
  const again = await stream(port);
  t.after(() => again.req.destroy());
  assert.equal(again.res.statusCode, 200);
});

test('only GET; without a bus the route does not exist', async (t) => {
  const { base } = await start(t);
  assert.equal((await fetch(`${base}/api/events`, { method: 'POST' })).status, 404);
  const db = openDb(':memory:');
  const server = createApp(db);
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

test('a room made, edited or deleted publishes room part room', async (t) => {
  const { events, base } = await start(t);
  const got = collect(events);
  const body = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
  const made = await (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  assert.equal(await put(base, `/api/rooms/${made.id}`, { ...body, length: 7 }), 200);
  assert.equal((await fetch(`${base}/api/rooms/${made.id}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual(got, [['room', { id: made.id, part: 'room' }], ['room', { id: made.id, part: 'room' }], ['room', { id: made.id, part: 'room' }]]);
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

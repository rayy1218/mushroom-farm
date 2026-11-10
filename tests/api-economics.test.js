// The Economics routes (spec 2026-11-06-economics-design.md 7): GET /api/economics, PUT and DELETE /api/economics/figures,
// POST /api/economics/work-out, their refusals and the 'economics' event; one Work it out through the real simulations queue
// to a saved figure; the owner's only: a worker gets 403 on every route and never hears 'economics' on the live stream.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';
import { createApi } from '../server/api.js';
import { createSimulations, RESTART_TEXT } from '../server/simulations.js';
import { hashSecret } from '../server/auth.js';
import { OWNER_EVENTS } from '../server/live.js';

const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

async function app(t, { login = false, simulations = null } = {}) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const room = db.createRoom(ROOM, Date.now()).id;
  const sims = simulations ? simulations({ db, events, room }) : null;
  const server = createApp(db, { login, events, simulations: sims, loginNotify: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    sims?.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, cookie) => {
    const headers = { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) };
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, events, seen, room, call, base, port: server.address().port };
}
const fig = (v, key) => v.figures.find((f) => f.key === key);
const economics = (seen) => seen.filter(([type]) => type === 'economics').map(([, d]) => d);

test('GET /api/economics: the first room and its crop without a query; the room and crop asked; refusals', async (t) => {
  const { call, room } = await app(t);
  const r = await call('GET', '/api/economics');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body), ['rooms', 'room', 'crop', 'ways', 'left', 'figures', 'sim', 'machinesNote', 'errors']);
  assert.deepEqual([r.body.room.id, r.body.crop], [room, 'lionsmane']);
  const oyster = await call('GET', `/api/economics?room=${room}&crop=oyster`);
  assert.deepEqual([oyster.status, oyster.body.crop, oyster.body.ways], [200, 'oyster', ['yours', 'shed']]);
  assert.deepEqual(await call('GET', '/api/economics?crop=reishi'), { status: 400, body: { error: 'Pick a crop', field: 'crop' } });
  assert.deepEqual(await call('GET', '/api/economics?room=99'), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('GET', '/api/economics?room=abc'), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('POST', '/api/economics'), { status: 404, body: { error: 'Not found' } });
  assert.deepEqual(await call('GET', '/api/economics/nope'), { status: 404, body: { error: 'Not found' } });
  assert.deepEqual(await call('GET', '/api/economics/figures'), { status: 404, body: { error: 'Not found' } });
});

test('GET /api/economics after the last room is deleted: the room asked for is a 404; without it the empty view', async (t) => {
  const { call, db, room } = await app(t);
  db.deleteRoom(room);
  assert.deepEqual(await call('GET', `/api/economics?room=${room}&crop=oyster`), { status: 404, body: { error: 'Room not found' } });
  const empty = await call('GET', '/api/economics?crop=oyster');
  assert.deepEqual([empty.status, empty.body.rooms, empty.body.room, empty.body.crop], [200, [], null, 'oyster']);
});

test('PUT and DELETE /api/economics/figures: saved, told, cleared; refusals in their words', async (t) => {
  const { call, room, seen } = await app(t);
  const put = await call('PUT', '/api/economics/figures', { room, crop: 'lionsmane', key: 'price', value: 55 });
  assert.equal(put.status, 200);
  assert.deepEqual([fig(put.body, 'price').value, fig(put.body, 'price').source], [55, 'owner']);
  assert.deepEqual(economics(seen), [{ roomId: room, crop: 'lionsmane' }]);
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room, crop: 'lionsmane', key: 'price', value: 5000 }),
    { status: 400, body: { error: 'Selling price must be a number from RM\u00a00 to RM\u00a01,000\u00a0a\u00a0kg', field: 'value' } });
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room, crop: 'lionsmane', key: 'nope', value: 1 }),
    { status: 400, body: { error: 'Unknown figure', field: 'key' } });
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room, crop: 'lionsmane', key: 'tariff', value: 0.6 }),
    { status: 400, body: { error: 'Electricity price is set in Settings', field: 'key' } });
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room: 99, crop: 'lionsmane', key: 'price', value: 1 }),
    { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room: String(room), crop: 'lionsmane', key: 'price', value: 1 }),
    { status: 404, body: { error: 'Room not found' } }, 'a room is a whole number');
  const del = await call('DELETE', `/api/economics/figures?room=${room}&crop=lionsmane&key=price`);
  assert.deepEqual([del.status, fig(del.body, 'price').source], [200, 'research']);
  const again = await call('DELETE', `/api/economics/figures?room=${room}&crop=lionsmane&key=price`);
  assert.equal(again.status, 200, 'nothing set: 200 all the same');
  assert.equal(economics(seen).length, 2, 'told once for the save and once for the clear');
  assert.deepEqual(await call('DELETE', '/api/economics/figures?crop=lionsmane&key=price'), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('DELETE', '/api/economics/figures?room=abc&crop=lionsmane&key=price'), { status: 404, body: { error: 'Room not found' } });
});

test('POST /api/economics/work-out without a simulations queue: 404', async (t) => {
  const { call, room } = await app(t);
  assert.deepEqual(await call('POST', '/api/economics/work-out', { room, crop: 'oyster' }), { status: 404, body: { error: 'Not found' } });
});

test('Work it out through the real simulations queue: a 10-block room over one day, to a saved figure', async (t) => {
  const { call, room, seen } = await app(t, {
    simulations: ({ db, events }) => createSimulations({ db, onChange: (type, data) => events.publish(type, data) }),
  });
  for (const [key, value] of [['yours.blocks', 10], ['yours.flushes', 1], ['yours.first', 1], ['yours.turn', 0]]) {
    assert.equal((await call('PUT', '/api/economics/figures', { room, crop: 'oyster', key, value })).status, 200);
  }
  const started = await call('POST', '/api/economics/work-out', { room, crop: 'oyster' });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  assert.ok(['waiting', 'working'].includes(started.body.sim.status));
  assert.equal((await call('POST', '/api/economics/work-out', { room, crop: 'oyster' })).status, 409, 'one at a time');
  const ended = () => seen.some(([type, d]) => type === 'simulation' && (d.status === 'done' || d.status === 'failed'));
  for (let i = 0; i < 200 && !ended(); i++) await new Promise((r) => setTimeout(r, 50)); // its run's end settles the row
  const v = (await call('GET', `/api/economics?room=${room}&crop=oyster`)).body;
  assert.equal(v.sim.status, 'done', JSON.stringify(v.sim));
  assert.deepEqual([v.sim.blocks, v.sim.days], [10, 1]);
  assert.ok(v.sim.kwh > 0 && Math.abs(v.sim.value - v.sim.kwh / 10) < 0.01, 'kWh ÷ blocks (kWh kept to 0.1, the figure to 0.001)');
  assert.deepEqual([fig(v, 'yours.kwhBlock').source, fig(v, 'yours.kwhBlock').value], ['simulator', v.sim.value]);
  const runs = (await call('GET', `/api/rooms/${room}/simulations`)).body;
  assert.deepEqual([runs.length, runs[0].input.days, runs[0].input.crops], [1, 1, [{ crop: 'oyster', blocks: 10 }]], 'one of the room\'s simulations');
});

test('built with the API, after the simulations queue: a Work it out left working by a restart settles before any request', async (t) => {
  const { db, call, room, seen } = await app(t, {
    simulations: ({ db, events, room }) => {
      const at = Date.now();
      const run = db.createRun(room, { days: 1 }, at); // a run the last farm app left queued, and its Work it out
      db.startEconomicsSim({ roomId: room, crop: 'oyster', simId: run.id, at });
      return createSimulations({ db, onChange: (type, data) => events.publish(type, data) }); // fails it, as main.js
    },
  });
  assert.deepEqual(db.economicsSimsWorking(), [], 'settled as the API was made, not at the first request');
  assert.deepEqual(economics(seen), [{ roomId: room, crop: 'oyster' }]);
  const v = (await call('GET', `/api/economics?room=${room}&crop=oyster`)).body;
  assert.deepEqual([v.sim.status, v.sim.error], ['failed', RESTART_TEXT]);
});

test('api.close stops the Economics service: a run ending while it is open settles; one ending after it, nothing', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const events = createEvents();
  const room = db.createRoom(ROOM, Date.now()).id;
  const api = createApi(db, null, null, null, null, null, events);
  const at = Date.now();
  const working = (crop) => {
    const run = db.createRun(room, { days: 1 }, at);
    db.startEconomicsSim({ roomId: room, crop, simId: run.id, at });
    return run;
  };
  const end = (run) => {
    db.finishRun(run.id, { status: 'failed', error: 'Stopped' }, at + 1);
    events.publish('simulation', { id: run.id, status: 'failed' });
  };
  const [oyster, pink] = [working('oyster'), working('pink')];
  end(oyster);
  assert.deepEqual(db.economicsSimsWorking().map((row) => row.crop), ['pink'], 'listening while open: the oyster row settled');
  api.close();
  end(pink);
  assert.deepEqual(db.economicsSimsWorking().map((row) => row.crop), ['pink'], 'no longer listening');
});

// Signs in Ali (a worker, PIN 482913) and Ray (the owner) on a login app. → their cookies.
async function signIns(db, base) {
  db.setWorkers([{ name: 'Ali', active: true }]);
  const ali = db.listWorkers()[0].id;
  db.setSecret(ali, await hashSecret('482913'));
  const ray = db.setOwner('Ray', await hashSecret('long enough password'));
  const signIn = async (id, secret) => {
    const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, secret }) });
    return /^farm_session=[^;]+/.exec(res.headers.get('set-cookie'))[0];
  };
  return { worker: await signIn(ali, '482913'), owner: await signIn(ray, 'long enough password') };
}

test('the owner\'s only: a worker gets 403 on every Economics route; the owner is answered', async (t) => {
  const { db, call, base, room } = await app(t, { login: true });
  const { worker, owner } = await signIns(db, base);
  const routes = [
    ['GET', '/api/economics'], ['GET', `/api/economics?room=${room}&crop=oyster`],
    ['PUT', '/api/economics/figures', { room, crop: 'oyster', key: 'price', value: 12 }],
    ['DELETE', `/api/economics/figures?room=${room}&crop=oyster&key=price`],
    ['POST', '/api/economics/work-out', { room, crop: 'oyster' }],
  ];
  for (const [method, path, body] of routes) {
    assert.deepEqual(await call(method, path, body, worker), { status: 403, body: { error: 'Ask the owner' } }, `${method} ${path}`);
  }
  assert.equal(db.economicsFigures(room, 'oyster').length, 0, 'nothing a worker sent was saved');
  assert.equal((await call('GET', '/api/economics', undefined, owner)).status, 200);
  assert.equal((await call('PUT', '/api/economics/figures', { room, crop: 'oyster', key: 'price', value: 12 }, owner)).status, 200);
});

// Opens the live stream with a cookie; until(re) waits for its text to match.
function stream(port, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.get({ port, host: '127.0.0.1', path: '/api/events', headers: { cookie } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { text += d; });
      resolve({ req, text: () => text });
    });
    req.on('error', reject);
  });
}
const until = async (s, re) => {
  for (let i = 0; i < 100 && !re.test(s.text()); i++) await new Promise((r) => setTimeout(r, 20));
  assert.match(s.text(), re);
};

test('the live stream: a worker\'s never carries economics (the owner\'s events); the owner\'s does', async (t) => {
  assert.deepEqual([...OWNER_EVENTS], ['economics']);
  const { db, events, base, port } = await app(t, { login: true });
  const { worker, owner } = await signIns(db, base);
  const [w, o] = [await stream(port, worker), await stream(port, owner)];
  t.after(() => { w.req.destroy(); o.req.destroy(); });
  await until(w, /event: hello/);
  await until(o, /event: hello/);
  events.publish('economics', { roomId: 1, crop: 'oyster' });
  events.publish('harvest', { roomId: 1 });
  await until(w, /event: harvest/);
  await until(o, /event: harvest/);
  assert.doesNotMatch(w.text(), /economics/);
  assert.match(o.text(), /event: economics\ndata: \{"roomId":1,"crop":"oyster"\}/);
});

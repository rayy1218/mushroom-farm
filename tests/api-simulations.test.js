// The simulation routes over HTTP (spec 4.4), with an in-process job runner that the test finishes by hand.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createSimulations } from '../server/simulations.js';

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };
const body = (over = {}) => ({ physics, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1, ...over });

let db;
let sims;
let server;
let base;
let jobs;

before(async () => {
  db = openDb(':memory:');
  sims = createSimulations({ db, spawn: (job, handlers) => { const j = { job, handlers, stopped: false }; jobs.push(j); return { stop() { j.stopped = true; } }; } });
  server = createApp(db, { simulations: sims });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  sims.close();
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => {
  sims.close();
  for (const room of db.listRooms()) db.deleteRoom(room.id);
  jobs = [];
});

async function call(method, path, payload, headers = { 'content-type': 'application/json' }) {
  const init = { method };
  if (payload !== undefined) {
    init.headers = headers;
    init.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const newRoom = () => db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;

test('POST queues a run: 202 with the run and no result', async () => {
  const id = newRoom();
  const res = await call('POST', `/api/rooms/${id}/simulations`, body());
  assert.equal(res.status, 202);
  assert.equal(res.body.roomId, id);
  assert.equal(res.body.status, 'queued');
  assert.equal(res.body.input.days, 1);
  assert.equal('result' in res.body, false);
  assert.equal(jobs.length, 1);
});

test('POST: 404 for no room, 400 with the field, 415 and 400 for a bad body', async () => {
  assert.deepEqual((await call('POST', '/api/rooms/99/simulations', body())).body, { error: 'Room not found' });
  const id = newRoom();
  const bad = await call('POST', `/api/rooms/${id}/simulations`, body({ days: 91 }));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'days');
  assert.equal(bad.body.error, 'Days must be a whole number from 1 to 90');
  const wall = await call('POST', `/api/rooms/${id}/simulations`, body({ physics: { ...physics, wallUA: -5 } }));
  assert.equal(wall.body.field, 'physics.wallUA');
  assert.equal((await call('POST', `/api/rooms/${id}/simulations`, 'x', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call('POST', `/api/rooms/${id}/simulations`, '{nope')).status, 400);
  assert.equal(jobs.length, 0);
  assert.equal(db.listRuns(id).length, 0);
});

test('GET list: newest first, no result, with the summary when done', async () => {
  const id = newRoom();
  const a = (await call('POST', `/api/rooms/${id}/simulations`, body())).body;
  const b = (await call('POST', `/api/rooms/${id}/simulations`, body({ days: 2 }))).body;
  jobs[0].handlers.onDone({ series: [1], summary: { days: 1 } });
  const list = await call('GET', `/api/rooms/${id}/simulations`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((r) => r.id), [b.id, a.id]);
  assert.equal(list.body.some((r) => 'result' in r), false);
  assert.deepEqual(list.body[1].summary, { days: 1 });
  assert.equal(list.body[0].status, 'running');
  assert.equal((await call('GET', '/api/rooms/99/simulations')).status, 404);
});

test('GET one has the result; 404 when missing', async () => {
  const id = newRoom();
  const run = (await call('POST', `/api/rooms/${id}/simulations`, body())).body;
  assert.equal((await call('GET', `/api/simulations/${run.id}`)).body.result, null);
  jobs[0].handlers.onDone({ series: [1], summary: { days: 1 } });
  const done = await call('GET', `/api/simulations/${run.id}`);
  assert.deepEqual(done.body.result, { series: [1], summary: { days: 1 } });
  assert.equal(done.body.status, 'done');
  const light = await call('GET', `/api/simulations/${run.id}?result=0`);
  assert.equal(light.body.status, 'done');
  assert.equal('result' in light.body, false, '?result=0 leaves the result out');
  assert.deepEqual(await call('GET', '/api/simulations/999'), { status: 404, body: { error: 'Simulation not found' } });
});

test('DELETE: 204 and the run is gone; 404 when missing; other methods 404', async () => {
  const id = newRoom();
  const run = (await call('POST', `/api/rooms/${id}/simulations`, body())).body;
  assert.equal((await call('DELETE', `/api/simulations/${run.id}`)).status, 204);
  assert.equal((await call('GET', `/api/simulations/${run.id}`)).status, 404);
  assert.equal((await call('DELETE', `/api/simulations/${run.id}`)).status, 404);
  assert.equal((await call('PUT', `/api/simulations/${run.id}`, {})).status, 404);
  assert.equal((await call('DELETE', `/api/rooms/${id}/simulations`)).status, 404);
});

test('deleting the room deletes its runs', async () => {
  const id = newRoom();
  const run = (await call('POST', `/api/rooms/${id}/simulations`, body())).body;
  assert.equal((await call('DELETE', `/api/rooms/${id}`)).status, 204);
  assert.equal((await call('GET', `/api/simulations/${run.id}`)).status, 404);
});

test('the 6th unfinished run of a room is a 409, and deleting the room stops its worker', async () => {
  const id = newRoom();
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', `/api/rooms/${id}/simulations`, body())).status, 202);
  const sixth = await call('POST', `/api/rooms/${id}/simulations`, body());
  assert.deepEqual(sixth, { status: 409, body: { error: 'This room already has 5 simulations waiting or running' } });
  assert.equal((await call('DELETE', `/api/rooms/${id}`)).status, 204);
  assert.equal(jobs[0].stopped, true);
});

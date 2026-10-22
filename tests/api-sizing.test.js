// The suggestion routes over HTTP (spec 2026-10-22-suggest-machines-design.md 5), with an in-process job runner.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createSimulations } from '../server/simulations.js';

const physics = { wallUA: 30, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 100 };
const body = (over = {}) => ({ physics, crops: [{ crop: 'lionsmane', blocks: 950 }], farmType: 'ready', stage: 'fruiting', ...over });

let db, sims, server, base, jobs;

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
const reply = { target: 95, days: 17, estimate: { fanFlow: 150 }, best: [], reached: true, notes: [] };

test('POST queues a suggestion: 202 with its id, status, progress and the number of setups', async () => {
  const id = newRoom();
  const res = await call('POST', `/api/rooms/${id}/sizing`, body());
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { id: res.body.id, roomId: id, status: 'queued', progress: 0, tried: 0, total: 36, createdAt: res.body.createdAt, finishedAt: null, result: null, error: null });
  assert.equal(typeof res.body.createdAt, 'number');
  assert.equal(jobs.length, 1);
});

test('POST: 404 for no room, 400 with the field, 409 for a second one, 415 and 400 for a bad body, 404 for other methods', async () => {
  assert.deepEqual((await call('POST', '/api/rooms/99/sizing', body())).body, { error: 'Room not found' });
  const id = newRoom();
  const bad = await call('POST', `/api/rooms/${id}/sizing`, body({ target: 100 }));
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body, { error: 'Target must be a whole number from 50 to 99 %', field: 'target' });
  assert.equal((await call('POST', `/api/rooms/${id}/sizing`, body({ physics: { ...physics, wallUA: -5 } }))).body.field, 'physics.wallUA');
  assert.equal((await call('POST', `/api/rooms/${id}/sizing`, 'x', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call('POST', `/api/rooms/${id}/sizing`, '{nope')).status, 400);
  assert.equal(jobs.length, 0);
  assert.equal((await call('POST', `/api/rooms/${id}/sizing`, body())).status, 202);
  const second = await call('POST', `/api/rooms/${id}/sizing`, body());
  assert.deepEqual([second.status, second.body], [409, { error: 'A suggestion is already being worked out for this room' }]);
  assert.equal((await call('GET', `/api/rooms/${id}/sizing`)).status, 404);
});

test('GET: the job with progress, and the result when done; 404', async () => {
  const id = newRoom();
  const { body: job } = await call('POST', `/api/rooms/${id}/sizing`, body());
  jobs[0].handlers.onProgress(0.5);
  const running = await call('GET', `/api/sizing/${job.id}`);
  assert.equal(running.status, 200);
  assert.deepEqual([running.body.status, running.body.progress, running.body.result], ['running', 0.5, null]);
  jobs[0].handlers.onDone(reply);
  const done = await call('GET', `/api/sizing/${job.id}`);
  assert.deepEqual([done.body.status, done.body.progress, done.body.result], ['done', 1, reply]);
  assert.equal((await call('GET', '/api/sizing/999')).status, 404);
  assert.equal((await call('GET', '/api/sizing/0')).status, 404);
});

test('DELETE stops a running suggestion (204), then it is gone; 404 for none', async () => {
  const id = newRoom();
  const { body: job } = await call('POST', `/api/rooms/${id}/sizing`, body());
  assert.equal((await call('DELETE', `/api/sizing/${job.id}`)).status, 204);
  assert.equal(jobs[0].stopped, true);
  assert.equal((await call('GET', `/api/sizing/${job.id}`)).status, 404);
  assert.equal((await call('DELETE', `/api/sizing/${job.id}`)).status, 404);
  assert.equal((await call('PUT', `/api/sizing/${job.id}`, {})).status, 404);
  assert.equal((await call('POST', `/api/rooms/${id}/sizing`, body())).status, 202, 'the room can ask again');
});

test('deleting the room drops its suggestion', async () => {
  const id = newRoom();
  const { body: job } = await call('POST', `/api/rooms/${id}/sizing`, body());
  assert.equal((await call('DELETE', `/api/rooms/${id}`)).status, 204);
  assert.equal(jobs[0].stopped, true);
  assert.equal((await call('GET', `/api/sizing/${job.id}`)).status, 404);
});

test('a simulation run with its own time limit: stored input keeps control, ctx shows the one used; 400 on a bad one', async () => {
  const id = newRoom();
  const run = { physics: { ...physics, fanFlow: 150, acBTU: 12000, humidifierLH: 0.5 }, crops: [{ crop: 'lionsmane', blocks: 950 }], farmType: 'ready', stage: 'fruiting', days: 1 };
  const res = await call('POST', `/api/rooms/${id}/simulations`, { ...run, control: { exchangeMaxMin: 60 } });
  assert.equal(res.status, 202);
  assert.deepEqual(res.body.input.control, { exchangeMaxMin: 60 });
  assert.equal(res.body.input.ctx.control.exchangeMaxMin, 60);
  assert.equal(res.body.input.ctx.control.acFan, 'auto');
  assert.equal(jobs[0].job.ctx.control.exchangeMaxMin, 60);
  const plain = (await call('POST', `/api/rooms/${id}/simulations`, run)).body;
  assert.equal(plain.input.ctx.control.exchangeMaxMin, 10);
  assert.equal('control' in plain.input, false);
  assert.equal((await call('POST', `/api/rooms/${id}/simulations`, { ...run, control: {} })).body.field, 'control', 'nothing set');
  const more = await call('POST', `/api/rooms/${id}/simulations`, { ...run, control: { acDrop: 0, humidifierDuringExchange: false } });
  assert.deepEqual(more.body.input.control, { acDrop: 0, humidifierDuringExchange: false });
  assert.deepEqual([more.body.input.ctx.control.acDrop, more.body.input.ctx.control.humidifierDuringExchange], [0, false]);
  assert.equal((await call('POST', `/api/rooms/${id}/simulations`, { ...run, control: { acDrop: 11 } })).body.field, 'control.acDrop');
  assert.equal((await call('POST', `/api/rooms/${id}/simulations`, { ...run, control: { humidifierDuringExchange: 1 } })).body.field, 'control.humidifierDuringExchange');
  for (const control of [{ exchangeMaxMin: 0 }, { exchangeMaxMin: 121 }, { exchangeMaxMin: 10.5 }, { exchangeMaxMin: '60' }]) {
    const bad = await call('POST', `/api/rooms/${id}/simulations`, { ...run, control });
    assert.deepEqual([bad.status, bad.body.field], [400, 'control.exchangeMaxMin'], JSON.stringify(control));
  }
  assert.equal((await call('POST', `/api/rooms/${id}/simulations`, { ...run, control: 5 })).body.field, 'control');
  assert.equal((await call('POST', `/api/rooms/${id}/simulations`, { ...run, control: { exchangeMaxMin: 1 } })).status, 202);
});

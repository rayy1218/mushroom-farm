// The crop and stage program routes (spec 2026-10-20-crops-and-simulation-design.md 3.3).

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMachines } from '../server/machines.js';
import { createController } from '../server/controller.js';
import { mixBands } from '../web/crops.js';

let db;
let server;
let base;
let id;

before(async () => {
  db = openDb(':memory:');
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller });
  const controller = createController({ db, machines });
  server = createApp(db, { machines, controller });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => {
  for (const room of db.listRooms()) db.deleteRoom(room.id);
  id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
});

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const get = () => call('GET', `/api/rooms/${id}/crop`);
const put = (body) => call('PUT', `/api/rooms/${id}/crop`, body);
const OYSTER = [{ crop: 'oyster', blocks: 100 }];
const bandsOf = (c) => ({ co2Low: c.co2Low, co2High: c.co2High, co2Safety: c.co2Safety, tLow: c.tLow, tHigh: c.tHigh, rhLow: c.rhLow, rhHigh: c.rhHigh });

test('GET: the defaults of a room without crops', async () => {
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {
    crops: [], farmType: 'ready', stage: 'fruiting', stageSince: null, flush: 1, flushes: 4,
    days: { spawn: 21, pinning: 4, fruiting: 7, rest: 10 }, rampH: 4, autoAdvance: true, done: false,
    ramp: null, nextStage: null, targets: null,
  });
});

test('GET and PUT: 404 for no room, 415 without JSON, 400 for a bad body', async () => {
  assert.deepEqual((await call('GET', '/api/rooms/99999/crop')).body, { error: 'Room not found' });
  assert.equal((await call('PUT', '/api/rooms/99999/crop', {})).status, 404);
  const res = await fetch(`${base}/api/rooms/${id}/crop`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
  assert.equal((await put(null)).status, 400);
  assert.equal((await put([])).status, 400);
  assert.equal((await call('POST', `/api/rooms/${id}/crop`, {})).status, 404);
});

test('PUT crops for a room without crops starts the present stage now, with a ramp, and the bands stay', async () => {
  const before = db.getControl(id);
  const t0 = Date.now();
  const r = await put({ crops: OYSTER });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.crops, OYSTER);
  assert.equal(r.body.stage, 'fruiting');
  assert.ok(r.body.stageSince >= t0 && r.body.stageSince <= Date.now());
  const target = mixBands(OYSTER, 'fruiting').bands;
  assert.deepEqual(r.body.ramp.to, target);
  assert.equal(r.body.ramp.endAt, r.body.stageSince + 4 * 3_600_000);
  assert.deepEqual(r.body.targets.bands, target);
  assert.deepEqual(r.body.targets.warnings, []);
  assert.deepEqual(r.body.nextStage, { stage: 'rest', flush: 1, at: r.body.stageSince + 7 * 86_400_000 });
  assert.deepEqual(bandsOf(db.getControl(id)), bandsOf(before), 'the controller moves them');
  assert.equal(db.getProgram(id).ramp.to.tHigh, target.tHigh, 'stored');
});

test('PUT crops with rampH 0 writes the bands at once and keeps the other settings', async () => {
  db.setControl(id, { ...db.getControl(id), auto: true, acFan: 'high', acDrop: 2 });
  const r = await put({ crops: OYSTER, rampH: 0 });
  assert.equal(r.status, 200);
  const c = db.getControl(id);
  assert.deepEqual(bandsOf(c), mixBands(OYSTER, 'fruiting').bands);
  assert.equal(c.auto, true);
  assert.equal(c.acFan, 'high');
  assert.equal(c.acDrop, 2);
});

test('PUT a stage (even the same) starts it now; applyNow writes the bands at once; done is cleared', async () => {
  await put({ crops: OYSTER });
  const first = db.getProgram(id);
  db.setProgram(id, { ...first, done: true, stageSince: 5 });
  const r = await put({ stage: 'fruiting', applyNow: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.done, false);
  assert.ok(r.body.stageSince > 5);
  assert.deepEqual(bandsOf(db.getControl(id)), mixBands(OYSTER, 'fruiting').bands);
  assert.equal(r.body.ramp.endAt, r.body.stageSince);
  const rest = await put({ stage: 'rest' });
  assert.equal(rest.body.stage, 'rest');
  assert.equal(rest.body.flush, 1);
  assert.ok(rest.body.ramp.endAt > rest.body.stageSince);
  assert.deepEqual(rest.body.ramp.to, mixBands(OYSTER, 'rest').bands);
});

test('PUT crops [] drops the ramp and keeps the stage, its start and the bands', async () => {
  await put({ crops: OYSTER, rampH: 0 });
  const before = { stageSince: db.getProgram(id).stageSince, bands: bandsOf(db.getControl(id)) };
  const r = await put({ crops: [] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.crops, []);
  assert.equal(r.body.ramp, null);
  assert.equal(r.body.targets, null);
  assert.equal(r.body.nextStage, null);
  assert.equal(r.body.stageSince, before.stageSince);
  assert.deepEqual(bandsOf(db.getControl(id)), before.bands);
});

test('PUT blocks, flushes, days, rampH and autoAdvance keep the stage and the bands; days merge per stage', async () => {
  await put({ crops: OYSTER });
  const was = db.getProgram(id);
  const bands = bandsOf(db.getControl(id));
  const r = await put({ crops: [{ crop: 'oyster', blocks: 50 }, { crop: 'black', blocks: 50 }], flushes: 3, days: { rest: 12 }, rampH: 2, autoAdvance: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.crops.length, 2);
  assert.equal(r.body.flushes, 3);
  assert.deepEqual(r.body.days, { spawn: 21, pinning: 4, fruiting: 7, rest: 12 });
  assert.equal(r.body.rampH, 2);
  assert.equal(r.body.autoAdvance, false);
  assert.equal(r.body.stageSince, was.stageSince);
  assert.deepEqual(r.body.ramp, { to: was.ramp.to, endAt: was.ramp.endAt });
  assert.deepEqual(bandsOf(db.getControl(id)), bands);
  assert.equal(r.body.nextStage, null, 'automatic change is off');
});

test('PUT farmType: a stage that is not in the new type is a 400 on stage, unless a stage is given', async () => {
  const full = await put({ farmType: 'full', crops: OYSTER, stage: 'spawn' });
  assert.equal(full.status, 200);
  assert.equal(full.body.stage, 'spawn');
  const bad = await put({ farmType: 'ready' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'stage');
  assert.equal((await get()).body.farmType, 'full', 'nothing stored');
  const ok = await put({ farmType: 'ready', stage: 'rest' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.stage, 'rest');
});

test('PUT validation: 400 with the field, nothing stored, unknown fields ignored', async () => {
  const cases = [
    [{ crops: [{ crop: 'nope', blocks: 1 }] }, 'crops'],
    [{ crops: 'x' }, 'crops'],
    [{ farmType: 'big' }, 'farmType'],
    [{ stage: 'harvest' }, 'stage'],
    [{ flushes: 0 }, 'flushes'],
    [{ flushes: 1.5 }, 'flushes'],
    [{ days: { rest: 0 } }, 'days.rest'],
    [{ days: 5 }, 'days'],
    [{ rampH: 49 }, 'rampH'],
    [{ autoAdvance: 'yes' }, 'autoAdvance'],
  ];
  for (const [body, field] of cases) {
    const r = await put(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.field, field, JSON.stringify(body));
    assert.ok(r.body.error);
  }
  assert.equal(db.getProgram(id).stageSince, null);
  const r = await put({ bogus: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.body.stageSince, null);
});

test('PUT a mix with no common band gives a warning in targets', async () => {
  const r = await put({ crops: [{ crop: 'lionsmane', blocks: 10 }, { crop: 'milky', blocks: 10 }] });
  assert.equal(r.status, 200);
  assert.ok(r.body.targets.warnings.length > 0);
});

test('PUT control with a band field ends a running ramp; other fields leave it', async () => {
  await put({ crops: OYSTER });
  assert.notEqual(db.getProgram(id).ramp, null);
  await call('PUT', `/api/rooms/${id}/control`, { auto: true, acFan: 'low' });
  assert.notEqual(db.getProgram(id).ramp, null);
  const r = await call('PUT', `/api/rooms/${id}/control`, { tHigh: 24 });
  assert.equal(r.status, 200);
  assert.equal(db.getProgram(id).ramp, null);
  assert.equal((await get()).body.ramp, null);
  assert.equal(db.getProgram(id).stage, 'fruiting');
});

// ---- review fixes: new blocks after the last flush, flushes, a band sent unchanged ----

const doneProgram = () => {
  const p = db.getProgram(id);
  db.setProgram(id, { ...p, crops: OYSTER, stage: 'rest', flush: 4, done: true, stageSince: Date.now(), ramp: null });
};

test('crops set again on a done room: new blocks from flush 1 in the first stage, not done', async () => {
  doneProgram();
  const r = await put({ crops: [{ crop: 'oyster', blocks: 200 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.done, false);
  assert.equal(r.body.flush, 1);
  assert.equal(r.body.stage, 'fruiting');
  assert.ok(r.body.ramp, 'the stage started');
  assert.equal(r.body.nextStage.stage, 'rest');
});

test('a stage started by hand on a done room starts at flush 1', async () => {
  doneProgram();
  const r = await put({ stage: 'fruiting' });
  assert.equal(r.body.flush, 1);
  assert.equal(r.body.done, false);
});

test('more flushes on a done room: the rest goes on to the next fruiting', async () => {
  doneProgram();
  const r = await put({ flushes: 5 });
  assert.equal(r.body.done, false);
  assert.deepEqual([r.body.nextStage.stage, r.body.nextStage.flush], ['fruiting', 5]);
});

test('flushes below the present flush: 400 on flushes', async () => {
  await put({ crops: OYSTER });
  const p = db.getProgram(id);
  db.setProgram(id, { ...p, flush: 3 });
  const r = await put({ flushes: 2 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: 'Flushes must be at least the present flush (3)', field: 'flushes' });
});

test('a control save that sends the bands unchanged does not end the ramp; a changed band does', async () => {
  await put({ crops: OYSTER });
  const control = (await call('GET', `/api/rooms/${id}/control`)).body;
  const six = bandsOf(control);
  await call('PUT', `/api/rooms/${id}/control`, { ...six, exchangeMaxMin: 12 });
  assert.ok((await get()).body.ramp, 'kept');
  await call('PUT', `/api/rooms/${id}/control`, { ...six, tLow: six.tLow - 1 });
  assert.equal((await get()).body.ramp, null, 'ended');
});

test('a done room: the same crops with more flushes resume it; newBlocks true restarts it at flush 1', async () => {
  doneProgram();
  const view = (await get()).body;
  const more = await put({ crops: view.crops, flushes: 5 });
  assert.equal(more.body.done, false);
  assert.equal(more.body.flush, 4, 'the same crops are not new blocks');
  doneProgram();
  const fresh = await put({ crops: view.crops, newBlocks: true });
  assert.equal(fresh.body.flush, 1);
  assert.equal(fresh.body.done, false);
  doneProgram();
  assert.equal((await put({ crops: view.crops, rampH: 2 })).body.done, true, 'the same crops with another change: still done');
});

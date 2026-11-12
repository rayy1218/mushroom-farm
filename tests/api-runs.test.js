// The Run page's routes (spec 2026-11-05-runs-design.md 5): GET /api/runs?crop= and GET /api/runs/:id, their 400 and 404s,
// no other method, and the 'costs' event when the run's energy has been worked out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';

const DAY = 86_400_000;
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4, trhAddress: 1 };

async function app(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const roomId = db.createRoom(ROOM, Date.now() - 2 * DAY).id;
  db.setProgram(roomId, { ...db.getProgram(roomId), crops: [{ crop: 'oyster', blocks: 600 }] }, { change: 'start', at: Date.now() - DAY });
  const runId = db.openRun(roomId).id;
  const server = createApp(db, { login: false, events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path) => {
    const res = await fetch(base + path, { method });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, seen, runId, roomId };
}

test('GET /api/runs: every run as a row; the crop filter; a crop that is not one is a 400 on crop', async (t) => {
  const { call, runId, roomId } = await app(t);
  const all = await call('GET', '/api/runs');
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.deepEqual(all.body.runs.map((r) => [r.id, r.roomId, r.roomName, r.kg]), [[runId, roomId, 'Container 1', 0]]);
  assert.deepEqual((await call('GET', '/api/runs?crop=oyster')).body.runs.length, 1);
  assert.deepEqual((await call('GET', '/api/runs?crop=pink')).body.runs, []);
  assert.deepEqual(await call('GET', '/api/runs?crop=mango'), { status: 400, body: { error: 'Pick a crop', field: 'crop' } });
});

test('GET /api/runs/:id: the run page\'s reply; 404 for no such run; no other method', async (t) => {
  const { call, runId } = await app(t);
  const one = await call('GET', `/api/runs/${runId}`);
  assert.equal(one.status, 200, JSON.stringify(one.body));
  assert.deepEqual(Object.keys(one.body), ['id', 'roomId', 'roomName', 'crops', 'partial', 'blocksInAt', 'startedAt', 'endedAt', 'kg', 'perBlock',
    'income', 'costs', 'profit', 'profitPerKg', 'pending', 'incomplete', 'kgSold', 'be', 'byCrop', 'flushes', 'missing', 'harvests',
    'harvestCount', 'batches', 'blockCost', 'sales', 'costsByKind', 'prices']);
  assert.deepEqual(Object.keys(one.body.sales), ['kg', 'total', 'byCrop', 'lines']);
  assert.deepEqual(await call('GET', '/api/runs/999'), { status: 404, body: { error: 'Run not found' } });
  assert.equal((await call('GET', '/api/runs/0')).status, 404);
  assert.equal((await call('GET', '/api/runs/abc')).status, 404);
  assert.equal((await call('POST', '/api/runs')).status, 404);
  assert.equal((await call('DELETE', `/api/runs/${runId}`)).status, 404);
});

test('a cold run reads pending; its energy worked out publishes costs, and the run reads whole', async (t) => {
  const { call, seen, runId } = await app(t);
  const cold = await call('GET', `/api/runs/${runId}`);
  assert.deepEqual([cold.body.pending, cold.body.costs, cold.body.profit], [true, null, null]);
  for (let i = 0; i < 100 && !seen.some(([type]) => type === 'costs'); i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(seen.some(([type]) => type === 'costs'), 'the warm done: costs published');
  const warm = await call('GET', `/api/runs/${runId}`);
  assert.deepEqual([warm.body.pending, warm.body.costs, warm.body.profit], [false, 0, 0]);
});

// ---- Money truth (spec 2026-11-12-money-truth-design.md 8.2) ----
test('PUT /api/runs/:id/blocks-in: a partial run\'s block-in day saved and told as harvest; a whole run 409; 400 with its field', async (t) => {
  const { mkdirSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync('/tmp/money-truth', { recursive: true });
  const file = join(mkdtempSync('/tmp/money-truth/runs-'), 'farm.db');
  const db = openDb(file);
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const roomId = db.createRoom(ROOM, Date.now() - 2 * DAY).id;
  db.setProgram(roomId, { ...db.getProgram(roomId), crops: [{ crop: 'oyster', blocks: 600 }] }, { change: 'start', at: Date.now() - DAY });
  const runId = db.openRun(roomId).id;
  const server = createApp(db, { login: false, events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const put = async (path, body) => {
    const res = await fetch(base + path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const when = Date.now() - 20 * DAY;
  assert.deepEqual(await put(`/api/runs/${runId}/blocks-in`, { blocksInAt: when }), {
    status: 409, body: { error: 'Only a run recorded from the harvest upgrade takes a block-in day' },
  });
  const raw = new DatabaseSync(file);
  raw.prepare('UPDATE runs SET partial = 1 WHERE id = ?').run(runId); // as the harvest upgrade left it
  raw.close();
  const saved = await put(`/api/runs/${runId}/blocks-in`, { blocksInAt: when });
  assert.deepEqual([saved.status, saved.body.blocksInAt], [200, when]);
  assert.ok(seen.some(([type, d]) => type === 'harvest' && d.roomId === roomId), 'told as harvest');
  assert.equal((await put(`/api/runs/${runId}/blocks-in`, { blocksInAt: Date.now() + DAY })).body.field, 'blocksInAt');
  assert.equal((await put('/api/runs/999/blocks-in', { blocksInAt: null })).status, 404);
  assert.equal((await fetch(`${base}/api/runs/${runId}/blocks-in`)).status, 404, 'PUT only');
});
